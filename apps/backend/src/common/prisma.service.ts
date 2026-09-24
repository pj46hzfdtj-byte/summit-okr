import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// SQLite 模式下需要手动序列化/反序列化的 JSON 字段
const JSON_FIELDS: Record<string, string[]> = {
  Objective: ["motivations", "feasibilities"],
  Review: ["krScores"],
  UserSetting: ["data"],
  AiMessage: ["metadata"],
};

// 所有 JSON 字段名的并集：用于递归解析关联查询里嵌套的模型
// （如 goalGroup.include.objectives 的 motivations 仍是字符串）
const ALL_JSON_KEYS = new Set(Object.values(JSON_FIELDS).flat());

/** 递归把结果树中所有「看起来是 JSON 的字符串」字段还原为对象/数组。
 *  仅在字符串以 [ 或 { 开头且能成功解析时替换，避免误伤普通字符串。 */
function deserializeNested(item: any): any {
  if (Array.isArray(item)) {
    for (let i = 0; i < item.length; i++) item[i] = deserializeNested(item[i]);
    return item;
  }
  if (item && typeof item === "object") {
    for (const k of Object.keys(item)) {
      const v = item[k];
      if (typeof v === "string" && ALL_JSON_KEYS.has(k) &&
          (v.startsWith("[") || v.startsWith("{"))) {
        try {
          item[k] = JSON.parse(v);
        } catch {
          // 保持原字符串
        }
      } else {
        item[k] = deserializeNested(v);
      }
    }
    return item;
  }
  return item;
}

function createPrismaClient() {
  const prisma = new PrismaClient();
  const isLocal = process.env.DB_MODE === "local";

  if (!isLocal) return prisma;

  // SQLite 模式：Prisma 不支持 Json 类型，改用 String 存储
  // 通过 $extends 扩展自动处理 JSON 序列化/反序列化
  return prisma.$extends({
    name: "jsonSerializer",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          const fields = JSON_FIELDS[model] || [];

          // 写入前：object → string
          if (fields.length > 0 && args?.data) {
            const data = args.data;
            const handle = (obj: any) => {
              if (!obj) return;
              for (const f of fields) {
                if (obj[f] != null && typeof obj[f] !== "string") {
                  obj[f] = JSON.stringify(obj[f]);
                }
              }
            };
            handle(data);
            if (data.create) handle(data.create);
            if (data.update) handle(data.update);
            if (data.where) handle(data.where);
          }

          const result = await query(args);

          // 读取后：string → object。
          // 顶层按当前模型字段解析；同时递归处理 include 关联里嵌套的模型，
          // 否则 goalGroup.include.objectives[].motivations 等仍会是 JSON 字符串。
          if (result != null) {
            const parse = (item: any) => {
              if (!item) return item;
              for (const f of fields) {
                if (item[f] != null && typeof item[f] === "string") {
                  try {
                    item[f] = JSON.parse(item[f]);
                  } catch {
                    // keep as string if parse fails
                  }
                }
              }
              return item;
            };
            if (Array.isArray(result)) result.forEach(parse);
            else parse(result);
            deserializeNested(result);
          }

          return result;
        },
      },
    },
  });
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private _client: ReturnType<typeof createPrismaClient>;
  [key: string]: any; // Proxy 转发需要：允许任意属性访问

  constructor() {
    this._client = createPrismaClient();
    // Proxy 转发：this.prisma.objective → this._client.objective
    return new Proxy(this, {
      get: (target, prop: string | symbol) => {
        if (prop in target) return (target as any)[prop];
        return (target._client as any)[prop];
      },
    }) as any;
  }

  async onModuleInit() {
    await (this._client as any).$connect();
    const mode = process.env.DB_MODE === "local" ? "SQLite (local)" : "PostgreSQL (Docker)";
    this.logger.log(`Prisma connected to database [${mode}]`);
  }

  async onModuleDestroy() {
    await (this._client as any).$disconnect();
    this.logger.log("Prisma disconnected");
  }
}