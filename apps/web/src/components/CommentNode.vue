<template>
  <div :id="'comment-' + comment.id" class="comment-node">
    <div class="comment-main">
      <el-avatar :size="32" :src="comment.avatar || undefined">{{ comment.userName?.slice(0, 1) }}</el-avatar>
      <div class="comment-body">
        <div class="comment-head">
          <span class="comment-author">{{ comment.userName }}</span>
          <span v-if="isHot" class="hot-badge" title="这条评论获赞最多">🔥 神评</span>
          <span class="comment-time">{{ comment.createdAt }}</span>
        </div>
        <div class="comment-content">{{ comment.content }}</div>
        <div class="comment-actions">
          <el-button
            link
            size="small"
            class="comment-like"
            :class="{ 'is-liked': comment.liked }"
            @click="emit('like', comment)"
          >
            <span class="like-icon">{{ comment.liked ? '❤️' : '🤍' }}</span>
            <span class="like-count">{{ comment.likeCount > 0 ? comment.likeCount : '赞' }}</span>
          </el-button>
          <el-button link type="primary" size="small" class="comment-reply" @click="emit('reply', comment)">回复</el-button>
        </div>
      </div>
    </div>
    <div v-if="comment.children && comment.children.length" class="comment-children">
      <CommentNode
        v-for="child in comment.children"
        :key="child.id"
        :comment="child"
        :hot-id="hotId"
        @reply="(node: CommentNode) => emit('reply', node)"
        @like="(node: CommentNode) => emit('like', node)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CommentNode } from '@/types/content';

defineOptions({ name: 'CommentNode' });

const props = defineProps<{
  comment: CommentNode;
  /** 获赞最多的那条评论的 id，用于打「神评」标记 */
  hotId?: number | null;
}>();

const emit = defineEmits<{
  reply: [comment: CommentNode];
  like: [comment: CommentNode];
}>();

const isHot = computed(() => props.hotId != null && props.comment.id === props.hotId);
</script>

<style scoped>
.comment-node { position: relative; scroll-margin-top: 90px; border-radius: var(--radius-md); }

/* 从评论管理跳转过来时，被定位的评论会短暂高亮 */
.comment-node.is-target { animation: comment-hit 2.4s ease; }
@keyframes comment-hit {
  0% { background: var(--chip-brand-bg); box-shadow: 0 0 0 2px var(--chip-brand-border); }
  70% { background: var(--chip-brand-bg); box-shadow: 0 0 0 2px var(--chip-brand-border); }
  100% { background: transparent; box-shadow: none; }
}
.comment-main {
  display: flex; gap: 12px;
  padding: 10px 10px 10px 0;
  border-radius: var(--radius-md);
  transition: background 0.16s ease;
}
.comment-main:hover { background: var(--chip-bg); }
.comment-main :deep(.el-avatar) {
  background: linear-gradient(135deg, var(--avatar-bg), var(--avatar-bg));
  color: var(--avatar-fg);
  font-weight: 600;
  flex: none;
}
.comment-body { flex: 1; min-width: 0; }
.comment-head { display: flex; align-items: center; gap: 10px; }
.comment-author { font-weight: 600; font-size: 13.5px; color: var(--text-strong); }
.comment-time { color: var(--text-faint); font-size: 12px; }
.comment-content { margin-top: 3px; font-size: 14.5px; line-height: 1.75; color: var(--text-body); white-space: pre-wrap; word-break: break-word; }

/* 神评标记 */
.hot-badge {
  font-size: 11px; font-weight: 600; line-height: 1;
  padding: 3px 7px; border-radius: 999px;
  color: var(--brand-600);
  background: var(--chip-brand-bg);
  border: 1px solid var(--chip-brand-border);
}

/* 点赞 / 回复：静止时弱化，悬停整条评论时显现 */
.comment-actions { display: flex; align-items: center; gap: 4px; margin-top: 2px; }
.comment-actions :deep(.el-button) { padding: 0 4px; height: 22px; }
.comment-like { opacity: 0.55; transition: opacity 0.16s ease; }
.comment-like.is-liked { opacity: 1; }
.comment-like.is-liked .like-count { color: var(--brand-600); font-weight: 600; }
.comment-main:hover .comment-like { opacity: 1; }
.like-icon { font-size: 13px; margin-right: 4px; }
.like-count { font-size: 12px; color: var(--text-muted); }
.comment-reply { opacity: 0; transition: opacity 0.16s ease; }
.comment-main:hover .comment-reply { opacity: 1; }

/* 楼中楼：左侧引导线 + 缩进，层级一眼可见 */
.comment-children {
  margin-left: 44px;
  padding-left: 14px;
  border-left: 2px solid var(--line-soft);
}
.comment-children:hover { border-left-color: var(--chip-brand-border); }
</style>
