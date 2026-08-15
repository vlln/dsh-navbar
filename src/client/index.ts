// dsh-navbar 的浏览器端 half（自渲染 + DOM 锚点契约）。
//
// 实现 issue dsh-external/issues#144「对话节点导航条」规格（registry 插件
// 版）：对话区右缘等距节点串（每 user 消息一节点）——激活药丸跟随阅读
// 位置、悬停/聚焦玻璃预览卡（6 行截断）、点击平滑滚动 + 品牌蓝高亮环、
// >11 节点滑动窗口、平时隐形悬停浮现磨砂胶囊、prefers-reduced-motion、
// <2 条 user 消息自动隐藏。
//
// 零数据通道依赖：只靠官方锚点属性（0806 起 user 行为 data-time-hover-root
//（UserStyleBubble 行），data-chat-flow-kind 已移除）。
//
// 构建：README.md「构建 client bundle」用 tsdown 产出 lib/client.js
//（CJS + ModuleLoader 包装）。
//
// pin 精选：在 assistant 消息操作条（copy 与 Good response 之间）注册
// 📌 按钮；精选状态按会话持久化到 localStorage，并以行属性
// data-vlln-pinned / data-vlln-pin-text 作为 DOM 契约——导航条据此把
// 对应轮次的节点渲染为金色细长椭圆盘（恒可见、预览卡带 📌 徽标、点击
// 直达被精选的回复）。
import React from 'react'
export default {
  name: 'navbar-client',
  // ctx：cordis 客户端根上下文（slots/locale/effect 服务）。
  // cordis 要求显式声明依赖：apply 内访问的 ctx.locale / ctx.slots
  // 必须出现在 inject 中，否则报 "cannot get property 'xxx' without inject"。
  inject: ['locale', 'slots'],
  apply(ctx: any) {
    const body = document.body
    if (body === null) return

    const STYLE_ID = 'dsh-navbar-style'
    if (document.getElementById(STYLE_ID) === null) {
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = `
[data-dsh-navbar] {
  position: fixed; top: 50%; transform: translateY(-50%); z-index: 900;
  display: flex; flex-direction: column; gap: 10px; padding: 8px;
  border-radius: 12px; font-family: system-ui;
  max-height: calc(100vh - 32px); overflow-y: auto;
  background: transparent; border: 1px solid transparent;
  transition: background .18s ease, border-color .18s ease;
}
[data-dsh-navbar]:hover {
  /* 无背景无边框：用户不要悬停时的胶囊圆角矩形（节点自身 hover 已够）。 */
}
[data-vlln-dot] {
  width: 7px; height: 7px; border-radius: 999px; padding: 0; border: none;
  background: rgba(128, 128, 140, .45); cursor: pointer; flex: none;
  transition: width .22s ease, height .22s ease, background .22s ease, transform .22s ease;
}
[data-vlln-dot]:hover { background: var(--dsw-alias-interactive-bg-hover); transform: scale(1.25); }
[data-vlln-dot].active {
  width: 22px; border-radius: 999px;
  background: var(--dsw-alias-text-accent, #4c9aff);
}
[data-vlln-preview] {
  /* 与官方 session 预览卡（HoverCard）同款：实色 #2C2C2E 双主题一致、
   * 244 宽、r12、lv3 阴影——同类型 hover 预览卡视觉统一，不用玻璃。 */
  position: fixed; z-index: 910; width: 244px; box-sizing: border-box;
  padding: 12px 16px; border-radius: 12px; font-size: 12px; line-height: 1.55;
  color: var(--dsw-alias-text-1, #eee);
  background: var(--dsw-hovercard-bg, #2C2C2E);
  box-shadow: var(--dsw-shadow-lv3);
  overflow: hidden; white-space: pre-wrap; word-break: break-word;
  display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical;
  pointer-events: none;
}
[data-vlln-more] { width: 3px; height: 3px; border-radius: 999px; background: rgba(128,128,140,.5); flex: none; }
[data-vlln-dot].pinned {
  /* 精选轮次：金色细长椭圆盘——与普通深灰圆点（7×7）和激活蓝药丸
   * （22×7）都不同的第三形态，尺寸适中、hover 不膨胀突兀。 */
  width: 14px; height: 8px; border-radius: 999px; background: #f0b429;
  filter: drop-shadow(0 0 4px rgba(240, 180, 41, .6));
}
[data-vlln-dot].active.pinned {
  /* 激活中的精选点：拉长为金色胶囊，保持"盘"的细长形态语义。 */
  width: 22px; height: 8px; border-radius: 999px;
  background: #f0b429; filter: none;
}
[data-vlln-pin-button] {
  width: 28px; height: 28px; padding: 6px; border: none; border-radius: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--dsw-alias-label-tertiary); background: transparent; cursor: pointer;
  transition: background .18s ease, color .18s ease;
}
[data-vlln-pin-button]:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }
[data-vlln-pin-button][data-active] { color: #f0b429; }
@media (prefers-reduced-motion: reduce) {
  [data-dsh-navbar], [data-vlln-dot], [data-vlln-dot].active {
    transition: none; animation: none;
  }
}
`
      document.head.appendChild(style)
    }

    // 导航条容器（等距节点串；平时隐形，悬停浮现磨砂胶囊托底）。
    const bar = document.createElement('nav')
    bar.setAttribute('data-dsh-navbar', '')
    bar.setAttribute('aria-label', '用户消息导航')
    body.appendChild(bar)
    // 预览卡（悬停/聚焦节点时贴节点弹出，玻璃模糊 + 6 行截断）。
    const preview = document.createElement('div')
    preview.setAttribute('data-vlln-preview', '')
    preview.style.display = 'none'
    body.appendChild(preview)

    const flowOf = (): HTMLElement | null => document.querySelector('[data-chat-flow=""]')
    const scrollerOf = (): HTMLElement | null => {
      const flow = flowOf()
      if (flow === null) return null
      let n: HTMLElement | null = flow.parentElement
      while (n !== null) {
        const s = getComputedStyle(n)
        if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n
        n = n.parentElement
      }
      return null
    }
    // 全部消息行（user + assistant/Think 的 turn-tail 行）：排除 pending
    // steering。user 行 = UserStyleBubble（data-time-hover-root + 气泡
    // 结构）；assistant/Think 行 body 无 bubble。
    const allRows = (): HTMLElement[] =>
      [...document.querySelectorAll<HTMLElement>('[data-time-hover-root]')].filter(row =>
        !row.hasAttribute('data-pending-steering'))
    const userRows = (): HTMLElement[] =>
      allRows().filter(row => row.querySelector('[class*="bubble"]') !== null)

    // 位置：贴近对话流列右缘 + 12px，钳制视口内（列移动时触发，不进每帧路径）。
    const position = (): void => {
      const flow = flowOf()
      if (flow === null) return
      const right = flow.getBoundingClientRect().right
      const next = Math.round(Math.min(right + 12, window.innerWidth - bar.offsetWidth - 8))
      const nextLeft = `${Math.max(8, next)}px`
      if (bar.style.left !== nextLeft) bar.style.left = nextLeft
    }

    // 激活态：当前阅读头经过的最后一条 user 消息。滚动只重算激活（rAF
    // 节流，无逐帧测量）；激活药丸在节点串上滑动。
    let activeIndex = -1
    const computeActive = (): number => {
      const rows = userRows()
      if (rows.length === 0) return -1
      // 激活 = 视口内最顶部的那条 user 消息（阅读起点）。与跳转对齐：
      // 点击节点跳转把目标行放到视口顶部（block:start），激活必须指向
      // 那条（用"视口中央"会在跳转后指向下一条，造成不对齐）。
      let best = 0
      let found = false
      let bestTop = Number.POSITIVE_INFINITY
      for (let i = 0; i < rows.length; i++) {
        const top = rows[i]!.getBoundingClientRect().top
        if (top >= 0 && top < bestTop) { bestTop = top; best = i; found = true }
      }
      return found ? best : rows.length - 1
    }

    const WINDOW = 11 // 超过则滑动窗口
    const HALF_WINDOW = 5
    // 当前窗口起点（render 设置；updateActiveClass 用同一 lo 映射窗口内 dot）。
    let lo = 0

    // 预览：显示消息开头（最多 6 行，CSS line-clamp 截断）。精选轮次显示
    // 被精选回复的文本（pin 时存入行属性 data-vlln-pin-text）并加 📌 徽标。
    const positionPreview = (anchor: HTMLElement): void => {
      const r = anchor.getBoundingClientRect()
      // right 定位：卡片右缘贴 dot 左缘 - 14px（内容短的卡片也贴紧）。
      preview.style.right = `${window.innerWidth - r.left + 14}px`
      preview.style.top = `${Math.min(window.innerHeight - 120, r.top - 12)}px`
    }
    const showPreview = (row: HTMLElement, anchor: HTMLElement, pinnedRow: HTMLElement | null = null): void => {
      // 消息文本 = 气泡内文本（排除时间戳/操作按钮/分支提示——整行
      // textContent 会混入 actions 和官方提示文案）；CSS line-clamp 6 行
      // 截断。立即显示（导航点小、hover 精确，无需 session list 行的
      // 500ms 防误触延迟）。
      let text: string
      if (pinnedRow !== null) {
        text = (pinnedRow.getAttribute('data-vlln-pin-text') ?? '').trim()
        if (text === '') text = ((row.querySelector('[class*="bubble"]') ?? row).textContent ?? '').trim()
        else text = `📌 精选\n${text}`
      } else {
        const bubble = row.querySelector('[class*="bubble"]')
        text = ((bubble ?? row).textContent ?? '').trim()
      }
      if (text === '') return
      preview.textContent = text
      preview.style.display = 'block'
      positionPreview(anchor)
    }
    const hidePreview = (): void => { preview.style.display = 'none' }

    // 轮次精选映射：user 行 i 与其下一 user 行之间的 assistant 行中，返回
    // 第一个带 data-vlln-pinned 标记的（供高亮/预览/跳转使用），没有则 null。
    const pinnedRowOf = (all: HTMLElement[], rows: HTMLElement[], i: number): HTMLElement | null => {
      let start = -1
      for (let k = 0; k < all.length; k++) { if (all[k] === rows[i]) { start = k; break } }
      if (start < 0) return null
      const end = i + 1 < rows.length ? all.indexOf(rows[i + 1]) : all.length
      if (end < 0) return null
      for (let k = start; k < end; k++) { if (all[k]?.hasAttribute('data-vlln-pinned')) return all[k]! }
      return null
    }

    // 渲染节点串：等距节点 + 滑动窗口（>11 时显示激活 ± 5，端点细点）。
    const render = (): void => {
      position()
      // 仅在对话页面显示：无对话流列（设置页/其他视图）时隐藏。
      if (flowOf() === null) {
        bar.style.display = 'none'
        return
      }
      const rows = userRows()
      // <2 条 user 消息自动隐藏。
      if (rows.length < 2) {
        bar.style.display = 'none'
        return
      }
      bar.style.display = 'flex'
      const active = computeActive()
      activeIndex = active
      // 精选轮次：每 user 行对应的 assistant 区间内是否有 data-vlln-pinned 行。
      const all = allRows()
      const pinnedRowOfTurn = (i: number): HTMLElement | null => pinnedRowOf(all, rows, i)
      const pinnedIndexes: number[] = []
      for (let i = 0; i < rows.length; i++) if (pinnedRowOfTurn(i) !== null) pinnedIndexes.push(i)
      // 窗口：>11 节点时截断（显示激活附近一段），端点细点暗示还有更多；
      // 精选节点恒可见：窗口扩到包含全部精选索引。
      const windowed = rows.length > WINDOW
      lo = windowed ? Math.max(0, active - HALF_WINDOW) : 0
      let hi = windowed ? Math.min(rows.length - 1, active + HALF_WINDOW) : rows.length - 1
      if (pinnedIndexes.length > 0) {
        lo = Math.min(lo, pinnedIndexes[0]!)
        hi = Math.max(hi, pinnedIndexes[pinnedIndexes.length - 1]!)
      }
      // 重建（点数/窗口变化时才重建；滚动只走 updateActive 不重建）。
      const dotCount = hi - lo + 1 + (windowed ? 2 : 0) // +2 端点细点
      if (bar.childElementCount === dotCount && rows.length >= 2) {
        // 窗口未变：只移动激活态（重建会重挂 dot，滚动时不应重建）。
        updateActiveClass(active)
        // pin/unpin 不改变点数时也需同步精选 class（否则非窗口模式下
        // 点击精选按钮后五角星不出现）。
        const dots = [...bar.querySelectorAll<HTMLElement>('[data-vlln-dot]')]
        dots.forEach((dot, i) => {
          const pinnedRow = pinnedRowOfTurn(i + lo)
          if (pinnedRow !== null) dot.classList.add('pinned')
          else dot.classList.remove('pinned')
        })
        return
      }
      bar.textContent = ''
      if (windowed && lo > 0) {
        const more = document.createElement('span')
        more.setAttribute('data-vlln-more', '')
        bar.appendChild(more)
      }
      for (let i = lo; i <= hi; i++) {
        const dot = document.createElement('button')
        dot.type = 'button'
        dot.setAttribute('data-vlln-dot', '')
        const row = rows[i]!
        const pinnedRow = pinnedRowOfTurn(i)
        // aria-label 而非 title：title 会叠加浏览器原生 tooltip（与预览卡
        // 重复）；aria-label 不显示 tooltip 但保留可访问名。
        dot.setAttribute('aria-label', `user #${i + 1}${pinnedRow !== null ? '（已精选）' : ''}（点击跳转）`)
        dot.addEventListener('mouseenter', () => showPreview(row, dot, pinnedRow))
        dot.addEventListener('mouseleave', hidePreview)
        dot.addEventListener('focus', () => showPreview(row, dot, pinnedRow))
        dot.addEventListener('blur', hidePreview)
        dot.addEventListener('click', () => {
          // 精选轮次点击直达被精选的回复（否则维持跳 user 行）。
          jumpToRow(pinnedRow ?? row)
        })
        if (i === active) dot.classList.add('active')
        if (pinnedRow !== null) dot.classList.add('pinned')
        bar.appendChild(dot)
      }
      if (windowed && hi < rows.length - 1) {
        const more = document.createElement('span')
        more.setAttribute('data-vlln-more', '')
        bar.appendChild(more)
      }
    }

    // 点击跳转：官方 follow 在 pinned-to-bottom 时拉回非 wheel 的程序化
    // 滚动。做法：先派发 wheel 事件建立官方 wheel 起源（合成事件无默认
    // 滚动），再立即改 1px scrollTop 触发第一个 scroll 事件（wheel 起源
    // 有效期内 movedByWheel=true → atBottomRef 解除），随后手动 rAF 缓动
    // 到目标——后续滚动即使 wheel 起源过期也不被拉回。
    const jumpToRow = (row: HTMLElement): void => {
      const scroller = scrollerOf()
      if (scroller === null) return
      scroller.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -1, bubbles: true, cancelable: true,
      }))
      const target = scroller.scrollTop + row.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      const start = scroller.scrollTop
      scroller.scrollTop = start + (target > start ? 1 : -1) // 第一步立即
      const dist = target - start
      const dur = Math.min(480, 160 + Math.abs(dist) * 0.25)
      const t0 = performance.now()
      const step = (now: number): void => {
        // 每帧续 wheel 起源：官方 onWheel 在 2 rAF 后清空 wheelStart，
        // 一旦过期后续滚动又被 follow 拉回；每帧重新 dispatch 让每次
        // scroll 事件都视为用户滚轮输入。
        scroller.dispatchEvent(new WheelEvent('wheel', {
          deltaY: -1, bubbles: true, cancelable: true,
        }))
        const p = Math.min(1, (now - t0) / dur)
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
        scroller.scrollTop = start + dist * eased
        if (p < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }

    // 窗口内激活态：第 i 个 dot 对应行 lo+i，只切换 class 不重建。
    const updateActiveClass = (active: number): void => {
      const dots = [...bar.querySelectorAll<HTMLElement>('[data-vlln-dot]')]
      dots.forEach((dot, i) => {
        if (i + lo === active) dot.classList.add('active')
        else dot.classList.remove('active')
      })
    }

    // 滚动只重算激活态（rAF 节流）：激活药丸滑动，不动节点重建。
    const updateActive = (): void => {
      const next = computeActive()
      if (next === activeIndex) return
      activeIndex = next
      render()
    }

    // 流容器绑定：初始 + 每次检测到流重建（会话切换/hero→active 等）时
    // 重绑尺寸观察并重新定位。
    let flow = flowOf()
    let sizeObserver: ResizeObserver | null = null
    const bindFlow = (): boolean => {
      const next = flowOf()
      if (next === flow) return false
      flow = next
      sizeObserver?.disconnect()
      sizeObserver = null
      if (flow !== null) {
        sizeObserver = new ResizeObserver(() => { position() })
        // 观察 flow 及其祖先链（到 body 为止）：侧边栏折叠/展开通过
        // AppFrame 的 grid 轨道动画改变布局——flow 自身 contentRect 在
        // 部分变化下不变（ResizeObserver 只报元素自身尺寸），但任一祖先
        // 尺寸变化都会移动 flow 位置。观察整条祖先链，布局变化必然触发
        // 重定位，不依赖官方 hash class。
        let el: HTMLElement | null = flow
        while (el !== null && el !== document.body) {
          sizeObserver.observe(el)
          el = el.parentElement
        }
      }
      position()
      return true
    }
    bindFlow()
    window.addEventListener('resize', position)
    // 滚动监听：重算激活态（rAF 节流）。
    let scrollScheduled = false
    const onScroll = (): void => {
      if (scrollScheduled) return
      scrollScheduled = true
      requestAnimationFrame(() => { scrollScheduled = false; updateActive() })
    }
    // 激活跟踪用 IntersectionObserver（比 scroll 事件绑定鲁棒：行进出
    // 视口自动触发，不依赖绑定时机/重建；滚动时交叉变化即更新激活态）。
    let io: IntersectionObserver | null = null
    const bindIO = (): void => {
      io?.disconnect()
      const root = scrollerOf()
      if (root === null) return
      io = new IntersectionObserver(() => {
        if (scrollScheduled) return
        scrollScheduled = true
        requestAnimationFrame(() => { scrollScheduled = false; updateActive() })
      }, { root, rootMargin: '0px 0px -15% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] })
      userRows().forEach(row => { io?.observe(row) })
    }
    bindIO()
    render()

    // 观察 body 全量，但回调只响应两类变更：流容器被替换，或变更落在
    // 当前流容器内（新消息/翻页/内容尺寸变化）。其他区域完全不触发——
    // 避免每帧 reflow 拖死页面。rAF 去抖合并同帧多次变更。
    let scheduled = false
    const schedule = (): void => {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(() => { scheduled = false; render() })
    }
    const observer = new MutationObserver((mutations) => {
      // flow 被移除/替换（切出对话页/视图）必须触发重渲染——此时
      // mutation 目标在父级（非 flow 内），过滤条件不匹配，需显式处理。
      if (bindFlow()) {
        schedule()
        return
      }
      bindIO()
      for (const m of mutations) {
        if (m.target === bar || bar.contains(m.target)) continue
        if (m.target === preview || preview.contains(m.target)) continue
        if (flow !== null && (m.target === flow || flow.contains(m.target))) {
          schedule()
          return
        }
      }
    })
    observer.observe(body, { childList: true, subtree: true })

    // ─── pin 精选 ──────────────────────────────────────────────────
    // 精选状态：按会话持久化到 localStorage；DOM 契约 = assistant 行上的
    // data-vlln-pinned（标记）与 data-vlln-pin-text（回复文本预览）。行标记
    // 由 PinAction 在挂载时按 store 恢复，导航条只读属性、不碰 store——
    // 刷新后精选状态由按钮组件自动重建，导航条 MutationObserver 之外还
    // 需要显式 schedule()（属性变更不触发 childList 观察）。
    interface PinItem { messageId: string; text: string; ts: number }
    const pinStore = {
      key(sessionId: string): string { return `dsh-navbar:pins:${sessionId}` },
      load(sessionId: string): PinItem[] {
        try { return JSON.parse(localStorage.getItem(this.key(sessionId)) ?? '[]') as PinItem[] } catch { return [] }
      },
      isPinned(sessionId: string, messageId: string): boolean {
        return this.load(sessionId).some((p) => p.messageId === messageId)
      },
      textOf(sessionId: string, messageId: string): string | undefined {
        return this.load(sessionId).find((p) => p.messageId === messageId)?.text
      },
      // 切换一条精选；返回切换后的状态（true = 已精选）。
      toggle(sessionId: string, messageId: string, text: string): boolean {
        const pins = this.load(sessionId)
        const i = pins.findIndex((p) => p.messageId === messageId)
        if (i >= 0) pins.splice(i, 1)
        else pins.push({ messageId, text, ts: Date.now() })
        localStorage.setItem(this.key(sessionId), JSON.stringify(pins))
        return i < 0
      },
    }
    // pin 时的回复文本：行首个子节点（turnTail 渲染结果），取不到回退整行。
    const pinRowText = (button: HTMLElement | null): string => {
      const row = button?.closest('[data-time-hover-root]')
      const tail = row?.children[0]
      const text = ((tail ?? row)?.textContent ?? '').trim()
      return text.length > 160 ? `${text.slice(0, 160)}…` : text
    }
    // 同步行标记 + 触发导航条重渲染（属性变更不走 MutationObserver）。
    const syncPinRow = (button: HTMLElement | null, isPinned: boolean, text?: string): void => {
      const row = button?.closest('[data-time-hover-root]')
      if (row === null || row === undefined) return
      if (isPinned) {
        row.setAttribute('data-vlln-pinned', '')
        row.setAttribute('data-vlln-pin-text', text ?? '')
      } else {
        row.removeAttribute('data-vlln-pinned')
        row.removeAttribute('data-vlln-pin-text')
      }
      schedule()
    }
    // 消息操作条按钮：copy 与 Good response（feedback，order 10）之间。
    function PinAction(props: { messageId: string; sessionId: string; t: (key: string) => string }): React.ReactElement {
      const { messageId, sessionId, t } = props
      const [active, setActive] = React.useState(() => pinStore.isPinned(sessionId, messageId))
      const ref = React.useRef<HTMLButtonElement | null>(null)
      // 挂载/身份变化时按 store 恢复行标记（刷新后精选状态由此重建）。
      React.useEffect(() => {
        syncPinRow(ref.current, pinStore.isPinned(sessionId, messageId), pinStore.textOf(sessionId, messageId))
      }, [messageId, sessionId])
      const label = active ? t('action.unpin') : t('action.pin')
      return React.createElement(
        'button',
        {
          type: 'button',
          ref,
          'data-vlln-pin-button': '',
          'data-active': active || undefined,
          'aria-pressed': active,
          'aria-label': label,
          title: label,
          onClick: () => {
            const text = pinRowText(ref.current)
            const next = pinStore.toggle(sessionId, messageId, text)
            setActive(next)
            syncPinRow(ref.current, next, text)
          },
        },
        React.createElement(
          'svg',
          { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true },
          React.createElement('path', { d: 'M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z' })
        )
      )
    }
    const PIN_NS = 'pin'
    ctx.effect(() => ctx.locale.register(PIN_NS, {
      zh: { 'action.pin': '精选', 'action.unpin': '取消精选' },
      en: { 'action.pin': 'Pin', 'action.unpin': 'Unpin' },
    }), 'navbar: pin dictionaries')
    ctx.slots.inject('conversation.chat.assistant-actions', () => {
      const dispose = ctx.slots.register({
        name: 'conversation.chat.assistant-actions',
        id: 'pin',
        order: 5,
        locale: PIN_NS,
        inject: (sessionId: string) => ({ sessionId }),
      }, PinAction)
      return () => { dispose() }
    })

    // 插件生命周期：unload 时清理（fiber dispose → apply 返回的 disposer）。
    return () => {
      observer.disconnect()
      sizeObserver?.disconnect()
      io?.disconnect()
      window.removeEventListener('resize', position)
      bar.remove()
      preview.remove()
      document.getElementById(STYLE_ID)?.remove()
    }
  },
}
