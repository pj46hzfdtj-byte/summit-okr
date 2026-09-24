<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { feedbackApi, type Feedback } from '@/api';

const { t } = useI18n();

const form = ref({
  type: 'bug' as 'bug' | 'suggestion' | 'other',
  content: '',
  contact: '',
});
const submitting = ref(false);
const history = ref<Feedback[]>([]);

const typeOptions = computed(() => [
  { label: t('help.types.bug'), value: 'bug' },
  { label: t('help.types.suggestion'), value: 'suggestion' },
  { label: t('help.types.other'), value: 'other' },
]);

async function loadHistory() {
  try {
    history.value = await feedbackApi.list();
  } catch {
    // ignore
  }
}

async function handleSubmit() {
  if (form.value.content.trim().length < 10) {
    ElMessage.warning(t('help.submitEmpty'));
    return;
  }
  submitting.value = true;
  try {
    await feedbackApi.create({
      type: form.value.type,
      content: form.value.content.trim(),
      contact: form.value.contact.trim() || undefined,
    });
    ElMessage.success(t('help.submitSuccess'));
    form.value.content = '';
    form.value.contact = '';
    await loadHistory();
  } catch {
    ElMessage.error(t('common.failed'));
  } finally {
    submitting.value = false;
  }
}

const statusTagType = (status: string) =>
  status === 'resolved' ? 'success' : 'info';

onMounted(loadHistory);
</script>

<template>
  <div class="help-page">
    <div class="page-header">
      <h2 class="page-title">{{ t('help.title') }}</h2>
      <p class="page-subtitle">{{ t('help.subtitle') }}</p>
    </div>

    <!-- 关于本项目 -->
    <el-card shadow="never" class="section-card about-card">
      <template #header>
        <span class="card-title">{{ t('help.aboutTitle') }}</span>
      </template>
      <p class="about-intro">{{ t('help.aboutIntro') }}</p>
      <div class="about-stats">
        <div class="stat-item">
          <div class="stat-num">10+</div>
          <div class="stat-label">{{ t('help.statModules') }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">50+</div>
          <div class="stat-label">{{ t('help.statApis') }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">4</div>
          <div class="stat-label">{{ t('help.statLanguages') }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">AI</div>
          <div class="stat-label">{{ t('help.statAI') }}</div>
        </div>
      </div>
      <div class="about-flow">
        <div class="flow-step">{{ t('help.flow1') }}</div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">{{ t('help.flow2') }}</div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">{{ t('help.flow3') }}</div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">{{ t('help.flow4') }}</div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">{{ t('help.flow5') }}</div>
      </div>
    </el-card>

    <!-- 快速上手 -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <span class="card-title">{{ t('help.quickStart') }}</span>
      </template>
      <div class="qs-grid">
        <div v-for="i in 8" :key="i" class="qs-item">
          <div class="qs-num">{{ i }}</div>
          <div class="qs-text">{{ t(`help.qs${i}`) }}</div>
        </div>
      </div>
    </el-card>

    <!-- 功能总览 -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <span class="card-title">{{ t('help.features') }}</span>
      </template>
      <div class="feature-grid">
        <div v-for="i in 10" :key="i" class="feature-item">
          <div class="feature-name">{{ t(`help.f${i}.name`) }}</div>
          <div class="feature-desc">{{ t(`help.f${i}.desc`) }}</div>
        </div>
      </div>
    </el-card>

    <!-- 常见问题 -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <span class="card-title">{{ t('help.faq') }}</span>
      </template>
      <el-collapse>
        <el-collapse-item v-for="i in 8" :key="i" :title="t(`help.faq${i}Q`)">
          <p class="faq-answer">{{ t(`help.faq${i}A`) }}</p>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <!-- 意见反馈 -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <span class="card-title">{{ t('help.feedback') }}</span>
      </template>
      <el-form :model="form" label-width="120px" style="max-width: 640px">
        <el-form-item :label="t('help.feedbackType')">
          <el-radio-group v-model="form.type">
            <el-radio-button
              v-for="opt in typeOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('help.content')">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="5"
            :placeholder="t('help.contentPlaceholder')"
            maxlength="1000"
            show-word-limit
          />
        </el-form-item>
        <el-form-item :label="t('help.contact')">
          <el-input
            v-model="form.contact"
            :placeholder="t('help.contactPlaceholder')"
            style="max-width: 320px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">
            {{ t('help.submit') }}
          </el-button>
        </el-form-item>
      </el-form>

      <div v-if="history.length" class="history">
        <el-divider />
        <h4 class="history-title">{{ t('help.feedbackHistory') }}</h4>
        <el-timeline>
          <el-timeline-item
            v-for="item in history"
            :key="item.id"
            :timestamp="String(item.createdAt)"
            placement="top"
          >
            <el-tag size="small" :type="statusTagType(item.status)">
              {{ t(`help.types.${item.type}`) }}
            </el-tag>
            <p class="history-content">{{ item.content }}</p>
            <span v-if="item.contact" class="history-contact">
              {{ item.contact }}
            </span>
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.help-page {
  max-width: 960px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.page-subtitle {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.section-card {
  margin-bottom: 20px;
}

.card-title {
  font-weight: 600;
  font-size: 16px;
}

// About
.about-card {
  background: linear-gradient(135deg, var(--el-fill-color-light), var(--el-fill-color));
}

.about-intro {
  margin: 0 0 16px;
  font-size: 15px;
  line-height: 1.8;
  color: var(--el-text-color-regular);
}

.about-stats {
  display: flex;
  gap: 32px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.stat-item {
  text-align: center;
}

.stat-num {
  font-size: 28px;
  font-weight: 800;
  color: var(--summit-primary);
  font-family: var(--font-mono);
  line-height: 1;
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.about-flow {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px;
  background: var(--el-bg-color);
  border-radius: 8px;
}

.flow-step {
  padding: 6px 14px;
  background: var(--summit-primary);
  color: #fff;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.flow-arrow {
  color: var(--el-text-color-secondary);
  font-size: 16px;
  flex-shrink: 0;
}

// Quick Start
.qs-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.qs-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.qs-num {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--summit-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qs-text {
  line-height: 1.6;
  color: var(--el-text-color-regular);
  font-size: 14px;
  padding-top: 4px;
}

// Features
.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.feature-item {
  padding: 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.feature-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.feature-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

// FAQ
.faq-answer {
  margin: 0;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  font-size: 14px;
}

// History
.history-title {
  margin: 8px 0 12px;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.history-content {
  margin: 6px 0 0;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
}

.history-contact {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
  .qs-grid,
  .feature-grid {
    grid-template-columns: 1fr;
  }
}
</style>
