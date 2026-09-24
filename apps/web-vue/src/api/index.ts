import http from './http';
import type {
  AuthResponse,
  AuthTokens,
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  User,
  UpdateUserDto,
  GoalGroup,
  CreateGoalGroupDto,
  UpdateGoalGroupDto,
  Objective,
  CreateObjectiveDto,
  UpdateObjectiveDto,
  KeyResult,
  CreateKeyResultDto,
  UpdateKeyResultDto,
  Record,
  CreateRecordDto,
  UpdateRecordDto,
  RecordTrendPoint,
  Memo,
  MemoOwnerType,
  CreateMemoDto,
  UpdateMemoDto,
  Task,
  CreateTaskDto,
  UpdateTaskDto,
  Vision,
  CreateVisionDto,
  UpdateVisionDto,
  Review,
  ReviewType,
  KrScore,
  CreateReviewDto,
  UpdateReviewDto,
  SummaryData,
  GanttData,
  FocusCycle,
  CreateFocusCycleDto,
  UpdateFocusCycleDto,
  FocusCycleObjective,
  AiPlanGoalDto,
  AiPlanGoalResult,
  AiPlanTaskDto,
  AiPlanTaskResult,
  AiSuggestScoreResult,
  AiSuggestMotivationsDto,
  AiSuggestMotivationsResult,
  AiConversation,
  AiMessage,
  AiUsageStat,
  AiWeeklyReportResult,
  CheckIn,
  CheckInStatus,
  AppNotification,
  RecycleItem,
  RecycleEntityType,
  UserSettings,
} from '@summit-okr/api-types';

// ============ Auth ============
export const authApi = {
  register: (dto: RegisterDto) => http.post<AuthResponse>('/auth/register', dto) as Promise<AuthResponse>,
  login: (dto: LoginDto) => http.post<AuthResponse>('/auth/login', dto) as Promise<AuthResponse>,
  refresh: (dto: RefreshTokenDto) => http.post<AuthTokens>('/auth/refresh', dto) as Promise<AuthTokens>,
  profile: () => http.get<User>('/auth/profile') as Promise<User>,
};

// ============ User ============
export const userApi = {
  getMe: () => http.get<User>('/users/me') as Promise<User>,
  updateMe: (dto: UpdateUserDto) => http.patch<User>('/users/me', dto) as Promise<User>,
  getSettings: () => http.get<UserSettings>('/users/me/settings') as Promise<UserSettings>,
  updateSettings: (dto: Partial<UserSettings>) =>
    http.put<UserSettings>('/users/me/settings', dto) as Promise<UserSettings>,
};

// ============ Vision ============
export const visionApi = {
  list: () => http.get<Vision[]>('/visions') as Promise<Vision[]>,
  create: (dto: CreateVisionDto) => http.post<Vision>('/visions', dto) as Promise<Vision>,
  update: (id: string, dto: UpdateVisionDto) => http.patch<Vision>(`/visions/${id}`, dto) as Promise<Vision>,
  markAchieved: (id: string) => http.post<Vision>(`/visions/${id}/achieve`) as Promise<Vision>,
  resetStatus: (id: string) => http.post<Vision>(`/visions/${id}/reset-status`) as Promise<Vision>,
  delete: (id: string) => http.delete(`/visions/${id}`),
};

// ============ GoalGroup ============
export const goalGroupApi = {
  getTree: (includeObjectives = false) =>
    http.get<GoalGroup[]>('/goal-groups', {
      params: { includeObjectives },
    }) as Promise<GoalGroup[]>,
  create: (dto: CreateGoalGroupDto) => http.post<GoalGroup>('/goal-groups', dto) as Promise<GoalGroup>,
  update: (id: string, dto: UpdateGoalGroupDto) =>
    http.patch<GoalGroup>(`/goal-groups/${id}`, dto) as Promise<GoalGroup>,
  delete: (id: string) => http.delete(`/goal-groups/${id}`),
  reorder: (ids: string[]) => http.post('/goal-groups/reorder', { ids }),
};

// ============ Objective ============
export const objectiveApi = {
  list: (params: { goalGroupId?: string; status?: string; page?: number; pageSize?: number }) =>
    http.get<{ list: Objective[]; total: number }>('/objectives', { params }) as Promise<{
      list: Objective[];
      total: number;
    }>,
  getById: (id: string) => http.get<Objective>(`/objectives/${id}`) as Promise<Objective>,
  create: (dto: CreateObjectiveDto) => http.post<Objective>('/objectives', dto) as Promise<Objective>,
  update: (id: string, dto: UpdateObjectiveDto) =>
    http.patch<Objective>(`/objectives/${id}`, dto) as Promise<Objective>,
  delete: (id: string) => http.delete(`/objectives/${id}`),
};

// ============ KeyResult ============
export const keyResultApi = {
  listByObjective: (objectiveId: string) =>
    http.get<KeyResult[]>(`/key-results/by-objective/${objectiveId}`) as Promise<KeyResult[]>,
  create: (dto: CreateKeyResultDto) => http.post<KeyResult>('/key-results', dto) as Promise<KeyResult>,
  update: (id: string, dto: UpdateKeyResultDto) =>
    http.patch<KeyResult>(`/key-results/${id}`, dto) as Promise<KeyResult>,
  delete: (id: string) => http.delete(`/key-results/${id}`),
};

// ============ Record ============
export const recordApi = {
  getTrend: (keyResultId: string) =>
    http.get<RecordTrendPoint[]>(`/records/trend/${keyResultId}`) as Promise<RecordTrendPoint[]>,
  create: (dto: CreateRecordDto) => http.post<Record>('/records', dto) as Promise<Record>,
  update: (id: string, dto: UpdateRecordDto) =>
    http.patch<Record>(`/records/${id}`, dto) as Promise<Record>,
  delete: (id: string) => http.delete(`/records/${id}`),
};

// ============ Memo ============
export const memoApi = {
  list: (ownerType: string, ownerId: string) =>
    http.get<Memo[]>('/memos', { params: { ownerType, ownerId } }) as Promise<Memo[]>,
  create: (dto: CreateMemoDto) => http.post<Memo>('/memos', dto) as Promise<Memo>,
  update: (id: string, dto: UpdateMemoDto) =>
    http.patch<Memo>(`/memos/${id}`, dto) as Promise<Memo>,
  delete: (id: string) => http.delete(`/memos/${id}`),
};

// ============ Task ============
export const taskApi = {
  list: (params: { status?: string; date?: string }) =>
    http.get<Task[]>('/tasks', { params }) as Promise<Task[]>,
  create: (dto: CreateTaskDto) => http.post<Task>('/tasks', dto) as Promise<Task>,
  update: (id: string, dto: UpdateTaskDto) =>
    http.patch<Task>(`/tasks/${id}`, dto) as Promise<Task>,
  complete: (id: string, completed: boolean) =>
    http.post<Task>(`/tasks/${id}/complete`, { completed }) as Promise<Task>,
  delete: (id: string) => http.delete(`/tasks/${id}`),
  deleteOverdue: () =>
    http.post<{ count: number }>('/tasks/delete-overdue') as Promise<{ count: number }>,
  batchDelete: (ids: string[]) =>
    http.post<{ count: number }>('/tasks/batch-delete', { ids }) as Promise<{ count: number }>,
};

// ============ FocusCycle ============
export const focusCycleApi = {
  getActive: () => http.get<FocusCycle | null>('/focus-cycles/active') as Promise<FocusCycle | null>,
  create: (dto: CreateFocusCycleDto) =>
    http.post<FocusCycle>('/focus-cycles', dto) as Promise<FocusCycle>,
  update: (id: string, dto: UpdateFocusCycleDto) =>
    http.patch<FocusCycle>(`/focus-cycles/${id}`, dto) as Promise<FocusCycle>,
  updateWeight: (cycleId: string, objectiveId: string, weight: number) =>
    http.patch(`/focus-cycles/${cycleId}/objectives/${objectiveId}/weight`, { weight }),
  endCycle: (cycleId: string) => http.post(`/focus-cycles/${cycleId}/end`),
};

// ============ Review ============
export const reviewApi = {
  list: (type?: string) => http.get<Review[]>('/reviews', { params: { type } }) as Promise<Review[]>,
  listByObjective: (objectiveId: string) =>
    http.get<Review[]>(`/reviews/by-objective/${objectiveId}`) as Promise<Review[]>,
  create: (dto: CreateReviewDto) => http.post<Review>('/reviews', dto) as Promise<Review>,
  update: (id: string, dto: UpdateReviewDto) =>
    http.patch<Review>(`/reviews/${id}`, dto) as Promise<Review>,
  delete: (id: string) => http.delete(`/reviews/${id}`),
};

// ============ Summary ============
export const summaryApi = {
  get: () => http.get<SummaryData>('/summary') as Promise<SummaryData>,
};

// ============ Gantt ============
export const ganttApi = {
  get: (params: { scope?: 'all' | 'cycle'; goalGroupId?: string }) =>
    http.get<GanttData>('/gantt', { params }) as Promise<GanttData>,
};

// ============ Data Export/Import ============
export const dataApi = {
  export: () =>
    http.get<Blob>('/data/export', { responseType: 'blob' }) as Promise<Blob>,
  import: (data: any, conflict: 'skip' | 'overwrite' = 'skip') =>
    http.post('/data/import', data, { params: { conflict } }) as Promise<any>,
};

// ============ Feedback ============
export interface Feedback {
  id: string;
  type: string;
  content: string;
  contact: string | null;
  status: string;
  createdAt: string | Date;
}

export const feedbackApi = {
  create: (dto: { type: string; content: string; contact?: string }) =>
    http.post<Feedback>('/feedback', dto) as Promise<Feedback>,
  list: () => http.get<Feedback[]>('/feedback') as Promise<Feedback[]>,
};

// ============ AI ============
export const aiApi = {
  planGoal: (dto: AiPlanGoalDto) =>
    http.post<AiPlanGoalResult>('/ai/plan-goal', dto) as Promise<AiPlanGoalResult>,
  planTasks: (dto: AiPlanTaskDto) =>
    http.post<AiPlanTaskResult>('/ai/plan-tasks', dto) as Promise<AiPlanTaskResult>,
  suggestScore: (objectiveId: string) =>
    http.post<AiSuggestScoreResult>('/ai/suggest-score', { objectiveId }) as Promise<AiSuggestScoreResult>,
  suggestMotivations: (dto: AiSuggestMotivationsDto) =>
    http.post<AiSuggestMotivationsResult>('/ai/suggest-motivations', dto) as Promise<AiSuggestMotivationsResult>,
  weeklyReport: () =>
    http.post<AiWeeklyReportResult>('/ai/weekly-report') as Promise<AiWeeklyReportResult>,
  listConversations: () => http.get<AiConversation[]>('/ai/conversations') as Promise<AiConversation[]>,
  getConversation: (id: string) => http.get<AiMessage[]>(`/ai/conversations/${id}`) as Promise<AiMessage[]>,
  getUsage: () => http.get<AiUsageStat>('/ai/usage') as Promise<AiUsageStat>,
};

// ============ Check-in ============
export const checkinApi = {
  status: () => http.get<CheckInStatus>('/checkins/status') as Promise<CheckInStatus>,
  upsertThisWeek: (note?: string) =>
    http.put<CheckIn>('/checkins/this-week', { note }) as Promise<CheckIn>,
  history: () => http.get<CheckIn[]>('/checkins/history') as Promise<CheckIn[]>,
};

// ============ Notification ============
export const notificationApi = {
  list: () =>
    http.get<{ list: AppNotification[]; unread: number }>('/notifications') as Promise<{
      list: AppNotification[];
      unread: number;
    }>,
  markRead: (id: string) => http.post(`/notifications/${id}/read`),
  markAllRead: () => http.post('/notifications/read-all'),
  remove: (id: string) => http.delete(`/notifications/${id}`),
};

// ============ Recycle Bin ============
export const recycleApi = {
  list: () => http.get<RecycleItem[]>('/recycle') as Promise<RecycleItem[]>,
  restore: (entityType: RecycleEntityType, id: string) =>
    http.post('/recycle/restore', { entityType, id }),
  destroy: (entityType: RecycleEntityType, id: string) =>
    http.post('/recycle/destroy', { entityType, id }),
  empty: () => http.delete<{ count: number }>('/recycle/empty') as Promise<{ count: number }>,
};

export type {
  AuthResponse,
  AuthTokens,
  User,
  GoalGroup,
  Objective,
  KeyResult,
  Record,
  Memo,
  MemoOwnerType,
  Task,
  Vision,
  Review,
  ReviewType,
  KrScore,
  SummaryData,
  GanttData,
  FocusCycle,
  FocusCycleObjective,
};
