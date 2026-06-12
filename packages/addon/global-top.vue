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

    <div v-if="visibleComments.length" :style="listStyle" data-testid="slidev-loop-comments">
      <div v-for="comment in visibleComments" :key="comment.id" :style="commentStyle">
        {{ comment.comment }}
      </div>
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
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useNav } from '@slidev/client'

const isDev = import.meta.env.DEV
const nav = useNav()
const comments = ref([])
const commentMode = ref(false)
const pendingPayload = ref(null)
const draftComment = ref('')
const inputRef = ref(null)
const currentPage = computed(() => nav.currentPage.value)
const visibleComments = computed(() =>
  comments.value.filter((comment) => comment.status === 'open' && comment.slideNo === currentPage.value),
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
  padding: '6px 8px',
  borderRadius: '6px',
  background: '#fef3c7',
  color: '#111827',
  boxShadow: '0 4px 12px rgb(0 0 0 / 0.18)',
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
  window.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('click', onDocumentClick, true)
})

onUnmounted(() => {
  if (!isDev) return
  window.removeEventListener('keydown', onKeyDown, true)
  document.removeEventListener('click', onDocumentClick, true)
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
  } catch (error) {
    console.warn('Slidev Loop comments could not be loaded:', error)
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
