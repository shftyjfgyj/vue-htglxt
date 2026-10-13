<template>
  <div class="rich-editor">
    <div ref="hostRef" class="editor-host" />
    <div class="editor-hint">
      <el-upload :show-file-list="false" :before-upload="onPickImage" accept="image/*">
        <el-button size="small" :loading="uploading">插入图片</el-button>
      </el-upload>
      <span class="hint-text">图片会先上传到服务端（仅 jpg/png/gif/webp，≤2MB），再插入正文</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { ElMessage } from 'element-plus';
import { uploadImage } from '@/api/upload';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const hostRef = ref<HTMLDivElement>();
const uploading = ref(false);
let quill: Quill | null = null;

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ color: [] }, { background: [] }],
  ['blockquote', 'code-block', 'link'],
  ['clean']
];

onMounted(() => {
  if (!hostRef.value) return;
  quill = new Quill(hostRef.value, { theme: 'snow', placeholder: '开始撰写正文…', modules: { toolbar: TOOLBAR } });
  quill.root.innerHTML = props.modelValue || '';
  quill.on('text-change', () => {
    const html = quill && quill.getText().trim().length === 0 ? '' : (quill?.root.innerHTML ?? '');
    emit('update:modelValue', html);
  });
});

// 外部（如恢复历史版本）改写内容时同步进编辑器
watch(
  () => props.modelValue,
  (value) => {
    if (!quill) return;
    if (value === quill.root.innerHTML) return;
    quill.root.innerHTML = value || '';
  }
);

onBeforeUnmount(() => { quill = null; });

async function onPickImage(file: File) {
  uploading.value = true;
  try {
    const result = await uploadImage(file);
    const range = quill?.getSelection(true);
    const index = range ? range.index : quill?.getLength() ?? 0;
    quill?.insertEmbed(index, 'image', result.url);
    quill?.setSelection(index + 1, 0);
    ElMessage.success('图片已插入');
  } finally {
    uploading.value = false;
  }
  return false;
}
</script>

<style scoped>
.rich-editor { display: flex; flex-direction: column; }
.editor-host { min-height: 340px; background: transparent; }

/* 让 Quill 融入稿纸：去掉外框、工具栏只留一条细分隔线 */
.rich-editor :deep(.ql-toolbar.ql-snow) {
  border: none;
  border-bottom: 1px solid var(--line-soft);
  padding: 6px 0 10px;
  background: transparent;
}
.rich-editor :deep(.ql-container.ql-snow) {
  border: none;
  font-family: var(--font-sans);
  font-size: 15px;
}
.rich-editor :deep(.ql-editor) {
  min-height: 380px;
  padding: 16px 2px;
  line-height: 1.9;
  color: var(--text-strong);
}
.rich-editor :deep(.ql-editor.ql-blank::before) {
  left: 2px;
  color: var(--text-faint);
  font-style: normal;
}
.rich-editor :deep(.ql-editor img) { max-width: 100%; border-radius: var(--radius-md); }
.rich-editor :deep(.ql-editor blockquote) {
  border-left: 3px solid var(--brand-300);
  background: var(--chip-bg);
  margin: 8px 0;
  padding: 6px 12px;
  color: var(--text-body);
}
.rich-editor :deep(.ql-editor pre.ql-syntax) {
  background: var(--chip-bg);
  color: var(--text-body);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}

/* 工具栏图标配色跟随主题 */
.rich-editor :deep(.ql-snow .ql-stroke) { stroke: var(--ink-400); }
.rich-editor :deep(.ql-snow .ql-fill),
.rich-editor :deep(.ql-snow .ql-stroke.ql-fill) { fill: var(--ink-400); }
.rich-editor :deep(.ql-snow .ql-picker) { color: var(--ink-400); }
.rich-editor :deep(.ql-snow.ql-toolbar button:hover .ql-stroke),
.rich-editor :deep(.ql-snow.ql-toolbar button.ql-active .ql-stroke) { stroke: var(--brand-500); }
.rich-editor :deep(.ql-snow.ql-toolbar button:hover .ql-fill),
.rich-editor :deep(.ql-snow.ql-toolbar button.ql-active .ql-fill) { fill: var(--brand-500); }
.rich-editor :deep(.ql-snow.ql-toolbar .ql-picker-label:hover),
.rich-editor :deep(.ql-snow.ql-toolbar .ql-picker-label.ql-active) { color: var(--brand-500); }

/* 底部图片上传提示 */
.editor-hint {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--line-soft);
}
.hint-text { color: var(--text-faint); font-size: 12px; }
</style>