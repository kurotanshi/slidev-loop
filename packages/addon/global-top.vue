<template>
  <div v-if="isDev" data-slidev-loop-ui>
    <div :style="panelStyle" data-testid="slidev-loop-overlay">
      <strong>Slidev Loop</strong>
      <span :style="mutedStyle">page {{ currentPage }}</span>
      <button type="button" :style="buttonStyle" @click="toggleCommentMode">
        {{ commentMode ? 'Commenting' : 'Comment' }}
      </button>
      <span v-if="commentMode" :style="hintStyle">click a slide element</span>
    </div>

    <div v-if="openComments.length" :style="listStyle" data-testid="slidev-loop-comments">
      <div
        v-for="comment in openComments"
        :key="comment.id"
        :style="commentStyle"
        data-testid="slidev-loop-comment-row"
      >
        <div :style="commentBodyStyle">
          <span :style="commentMetaStyle">p{{ comment.slideNo }}</span>
          <span :style="commentTextStyle">{{ comment.comment }}</span>
        </div>
        <button
          type="button"
          :aria-label="`Delete comment: ${comment.comment}`"
          :style="deleteButtonStyle"
          data-testid="slidev-loop-delete-comment"
          @click="deleteComment(comment.id)"
        >
          Delete
        </button>
      </div>
    </div>

    <div
      v-if="slideBounds && visibleComments.length"
      :style="pinsLayerStyle"
      data-testid="slidev-loop-pins"
    >
      <button
        v-for="(comment, index) in visibleComments"
        :key="comment.id"
        type="button"
        :aria-label="`Comment ${index + 1}: ${comment.comment}`"
        :style="getPinStyle(comment)"
        :title="comment.comment"
        data-testid="slidev-loop-pin"
      >
        <span :style="pinBadgeStyle">{{ index + 1 }}</span>
      </button>
    </div>

    <form
      v-if="pendingPayload"
      :style="formStyle"
      data-testid="slidev-loop-form"
      @submit.prevent="submitPendingComment"
      @keydown.esc.prevent.stop="cancelPendingComment"
    >
      <textarea
        ref="inputRef"
        v-model="draftComment"
        :style="inputStyle"
        data-testid="slidev-loop-input"
        rows="3"
        @keydown.enter.exact.prevent="submitPendingComment"
      />
      <div :style="formActionsStyle">
        <button type="button" :style="secondaryButtonStyle" @click="cancelPendingComment">
          Cancel
        </button>
        <button type="submit" :style="primaryButtonStyle">
          Add
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useNav } from '@slidev/client'

const isDev = import.meta.env.DEV
const nav = useNav()
const comments = ref([])
const commentMode = ref(false)
const pendingPayload = ref(null)
const draftComment = ref('')
const inputRef = ref(null)
const slideBounds = ref(null)
let removeCommentsChangedListener = () => {}
const currentPage = computed(() => nav.currentPage.value)
const openComments = computed(() => comments.value.filter((comment) => comment.status === 'open'))
const visibleComments = computed(() =>
  openComments.value.filter((comment) => comment.slideNo === currentPage.value),
)

const panelStyle = {
  position: 'fixed',
  top: '12px',
  right: '12px',
  zIndex: '40',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 10px',
  borderRadius: '6px',
  background: '#111827',
  color: 'white',
  font:
    '12px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}
const mutedStyle = { color: '#cbd5e1' }
const buttonStyle = {
  border: '1px solid #475569',
  borderRadius: '4px',
  padding: '2px 6px',
  background: '#1f2937',
  color: 'white',
  cursor: 'pointer',
}
const hintStyle = { color: '#fbbf24' }
const listStyle = {
  position: 'fixed',
  top: '52px',
  right: '12px',
  zIndex: '40',
  width: '240px',
  display: 'grid',
  gap: '6px',
  font:
    '12px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}
const commentStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '6px 8px',
  borderRadius: '6px',
  background: '#fef3c7',
  color: '#111827',
  boxShadow: '0 4px 12px rgb(0 0 0 / 0.18)',
}
const commentBodyStyle = {
  minWidth: '0',
  display: 'grid',
  gap: '2px',
}
const commentMetaStyle = {
  color: '#92400e',
  fontWeight: '700',
}
const commentTextStyle = {
  overflowWrap: 'anywhere',
}
const deleteButtonStyle = {
  border: '1px solid #b45309',
  borderRadius: '4px',
  padding: '2px 5px',
  background: '#fffbeb',
  color: '#7c2d12',
  cursor: 'pointer',
  font:
    '11px/1.3 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}
const pinsLayerStyle = {
  position: 'fixed',
  inset: '0',
  zIndex: '35',
  pointerEvents: 'none',
}
const pinBadgeStyle = {
  position: 'absolute',
  top: '-11px',
  left: '-11px',
  display: 'grid',
  placeItems: 'center',
  width: '22px',
  height: '22px',
  border: '2px solid #111827',
  borderRadius: '999px',
  background: '#f59e0b',
  color: '#111827',
  font:
    '700 12px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  boxShadow: '0 6px 16px rgb(0 0 0 / 0.22)',
}
const formStyle = {
  position: 'fixed',
  top: '52px',
  left: '50%',
  zIndex: '45',
  width: 'min(420px, calc(100vw - 32px))',
  transform: 'translateX(-50%)',
  padding: '10px',
  border: '1px solid #334155',
  borderRadius: '8px',
  background: '#0f172a',
  boxShadow: '0 16px 40px rgb(15 23 42 / 0.34)',
}
const inputStyle = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: '72px',
  resize: 'vertical',
  border: '1px solid #475569',
  borderRadius: '6px',
  padding: '8px',
  background: '#f8fafc',
  color: '#0f172a',
  font:
    '13px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}
const formActionsStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  marginTop: '8px',
}
const primaryButtonStyle = {
  ...buttonStyle,
  borderColor: '#f59e0b',
  background: '#f59e0b',
  color: '#111827',
  fontWeight: '700',
}
const secondaryButtonStyle = {
  ...buttonStyle,
  background: '#0f172a',
}

onMounted(() => {
  if (!isDev) return
  loadComments()
  updateSlideBounds()
  listenForCommentsChanged()
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('resize', updateSlideBounds)
  document.addEventListener('click', onDocumentClick, true)
})

onUnmounted(() => {
  if (!isDev) return
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('resize', updateSlideBounds)
  document.removeEventListener('click', onDocumentClick, true)
  removeCommentsChangedListener()
})

watch(currentPage, async () => {
  await nextTick()
  updateSlideBounds()
})

function toggleCommentMode() {
  commentMode.value = !commentMode.value
  if (!commentMode.value) cancelPendingComment()
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
  if (isTextInput(event.target)) return
  if (event.key.toLowerCase() !== 'c') return

  commentMode.value = !commentMode.value
  if (!commentMode.value) cancelPendingComment()
  event.preventDefault()
  event.stopPropagation()
}

async function onDocumentClick(event) {
  if (!commentMode.value) return
  if (!(event.target instanceof Element)) return
  if (event.target.closest('[data-slidev-loop-ui]')) return

  const target = event.target
  const slide = getSlideElement()
  if (!slide || !slide.contains(target)) return

  event.preventDefault()
  event.stopPropagation()

  const rect = getRelativeRect(target, slide)
  if (!rect) {
    console.warn('Slidev Loop could not locate the slide container for this comment target.')
    return
  }

  pendingPayload.value = {
    slideNo: currentPage.value,
    elementText: getElementText(target),
    selectorPath: getSelectorPath(target),
    rect,
  }
  draftComment.value = ''
  updateSlideBounds()
  await nextTick()
  inputRef.value?.focus()
}

async function submitPendingComment() {
  if (!pendingPayload.value) return
  const comment = draftComment.value.trim()
  if (!comment) return

  const payload = {
    ...pendingPayload.value,
    comment,
  }

  try {
    const response = await fetch('/__agent/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`Slidev Loop comment failed: ${response.status} ${body}`)
      return
    }
  } catch (error) {
    console.error('Slidev Loop comment failed:', error)
    return
  }

  commentMode.value = false
  cancelPendingComment()
  await loadComments()
}

function cancelPendingComment() {
  pendingPayload.value = null
  draftComment.value = ''
}

async function loadComments() {
  try {
    const response = await fetch('/__agent/comments')
    if (!response.ok) return
    const body = await response.json()
    comments.value = Array.isArray(body.comments) ? body.comments : []
    updateSlideBounds()
  } catch (error) {
    console.warn('Slidev Loop comments could not be loaded:', error)
  }
}

async function deleteComment(id) {
  try {
    const response = await fetch(`/__agent/comments/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!response.ok && response.status !== 404) {
      const body = await response.text()
      console.error(`Slidev Loop delete failed: ${response.status} ${body}`)
      return
    }
  } catch (error) {
    console.error('Slidev Loop delete failed:', error)
    return
  }

  await loadComments()
}

function listenForCommentsChanged() {
  const hot = import.meta.hot
  if (!hot) return

  const handler = () => loadComments()
  hot.on('slidev-loop:comments-changed', handler)
  removeCommentsChangedListener = () => hot.off?.('slidev-loop:comments-changed', handler)
}

function getPinStyle(comment) {
  const bounds = slideBounds.value
  const rect = comment.rect
  if (!bounds || !isValidRect(rect)) return { display: 'none' }

  const width = Math.max(24, rect.w * bounds.width)
  const height = Math.max(18, rect.h * bounds.height)

  return {
    position: 'fixed',
    left: `${bounds.left + rect.x * bounds.width}px`,
    top: `${bounds.top + rect.y * bounds.height}px`,
    width: `${width}px`,
    height: `${height}px`,
    margin: '0',
    padding: '0',
    border: '2px solid #f59e0b',
    borderRadius: '6px',
    background: 'rgb(245 158 11 / 0.14)',
    boxShadow: '0 0 0 2px rgb(17 24 39 / 0.72), 0 10px 24px rgb(0 0 0 / 0.18)',
    cursor: 'default',
    pointerEvents: 'auto',
  }
}

function getElementText(element) {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || element.tagName.toLowerCase()
}

function getSelectorPath(element) {
  const parts = []
  let current = element

  while (current && current instanceof Element && parts.length < 6) {
    const tag = current.tagName.toLowerCase()
    if (current.id) {
      parts.unshift(`${tag}#${current.id}`)
      break
    }

    const parent = current.parentElement
    if (!parent) {
      parts.unshift(tag)
      break
    }

    const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName)
    const index = siblings.indexOf(current)
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index + 1})` : tag)
    current = parent
  }

  return parts.join(' > ')
}

function getRelativeRect(element, slide) {
  const baseRect = slide.getBoundingClientRect()
  const targetRect = element.getBoundingClientRect()
  if (baseRect.width <= 0 || baseRect.height <= 0) return null

  return {
    x: clampRatio((targetRect.left - baseRect.left) / baseRect.width),
    y: clampRatio((targetRect.top - baseRect.top) / baseRect.height),
    w: clampRatio(targetRect.width / baseRect.width),
    h: clampRatio(targetRect.height / baseRect.height),
  }
}

function getSlideElement() {
  return document.querySelector('#slide-content') ?? document.querySelector('.slidev-slide-content')
}

function updateSlideBounds() {
  const slide = getSlideElement()
  if (!slide) {
    slideBounds.value = null
    return
  }

  const rect = slide.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    slideBounds.value = null
    return
  }

  slideBounds.value = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }
}

function isValidRect(rect) {
  return (
    rect &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.w) &&
    Number.isFinite(rect.h)
  )
}

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function isTextInput(target) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || target.isContentEditable
}
</script>
