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
// 精选按钮；精选状态按会话持久化到 localStorage，并以行属性
// data-vlln-pinned / data-vlln-pin-text 作为 DOM 契约——导航条据此把
// 对应轮次的节点渲染为金色细长椭圆盘（恒可见、预览显示精选上下文、点击
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
  scrollbar-width: none;
  background: transparent; border: 1px solid transparent;
  transition: background .18s ease, border-color .18s ease;
}
[data-dsh-navbar]::-webkit-scrollbar { display: none; }
[data-dsh-navbar]:hover {
  /* 无背景无边框：用户不要悬停时的胶囊圆角矩形（节点自身 hover 已够）。 */
}
[data-vlln-dot] {
  width: 7px; height: 7px; border-radius: 999px; padding: 0; border: none;
  background: rgba(128, 128, 140, .45); cursor: pointer; flex: none; position: relative;
  /* width 过渡只挂在增长态（active/hover/pinned）上：获得时平滑拉长，
   * 失去时立即缩回——否则旧激活药丸会在 .22s 收缩动画里以"灰色宽药丸"
   * 形态残留（点击跳转后底部出现幻影药丸）。 */
  transition: background .22s ease, transform .22s ease;
}
/* 命中区放大：视觉药丸仍 7px，::after 向四周扩 3px（13px 热区）。整条可点
 * 已覆盖点击，命中区只需小幅放大辅助直接点中药丸。 */
[data-vlln-dot]::after {
  content: ''; position: absolute; inset: -3px; border-radius: 999px;
}
/* :hover 伪类无视觉效果：hover 视觉统一由 .hover class（applyHover 门控）提供。
 * 伪类由 ::after 命中区触发、超出节点串范围时不受门控，scale 会造成
 * 边缘药丸 28px/9px 等不一致状态。 */
[data-vlln-dot]:hover { }
/* 增长态挂宽度过渡：获得 active/hover/pinned 时平滑拉长。 */
[data-vlln-dot].active, [data-vlln-dot].hover, [data-vlln-dot].pinned {
  transition: width .22s ease, height .22s ease, background .22s ease, transform .22s ease;
}
[data-vlln-dot].active {
  width: 22px; border-radius: 999px;
  background: var(--dsw-alias-text-accent, #4c9aff);
}
/* 悬停跟随：最近药丸加长（灰色，非品牌蓝），指示"整条可点"的点击落点。
 * transform:none 抵消 :hover 的 scale(1.25)——加长后宽度统一 22px。 */
[data-vlln-dot].hover {
  width: 22px; border-radius: 999px; transform: none;
  background: rgba(128, 128, 140, .8);
}
/* 悬停中的激活药丸保持品牌蓝（active 优先）。 */
[data-vlln-dot].active.hover { background: var(--dsw-alias-text-accent, #4c9aff); }
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
}
/* 精选盘 hover 同样加长（保持金色，与普通药丸一致的 hover 反馈）。 */
[data-vlln-dot].pinned.hover {
  width: 22px; height: 8px; background: #f0b429;
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

    // 流容器：官方聊天流（Chat 视图）优先；「聚焦会话」视图（第三方
    // dsh-focus-chat）挂载时 Chat 视图已卸载，回退到其列容器
    // [data-focus-flow]。两视图共享同一滚动容器，定位/滚动/激活跟踪一致。
    const flowOf = (): HTMLElement | null =>
      document.querySelector('[data-chat-flow=""]') ?? document.querySelector('[data-focus-flow=""]')
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
      allRows().filter(row =>
        // user 行识别按行角色，不靠宽泛的 bubble 后代检查：turnTail 压缩行
        // 有专属 data-turn-tail 属性，排除之——否则官方 Tooltip（class 含
        // "bubble"）挂载进 turnTail 行内时会被误判为 user 行，导航条凭空
        // 多出一个节点。
        !row.hasAttribute('data-turn-tail') &&
        row.querySelector('[class*="bubble"]') !== null)

    // 位置：贴近对话流列右缘 + 12px，钳制视口内（列移动时触发，不进每帧路径）。
    const position = (): void => {
      const flow = flowOf()
      if (flow === null) return
      const right = flow.getBoundingClientRect().right
      const next = Math.round(Math.min(right + 12, window.innerWidth - bar.offsetWidth - 8))
      const nextLeft = `${Math.max(8, next)}px`
      if (bar.style.left !== nextLeft) bar.style.left = nextLeft
    }
    // 位置重算统一 rAF 节流：resize 与 ResizeObserver（侧边栏折叠/展开动画
    // 一帧多次回调）合并成一帧一次布局读写，避免 layout thrash。
    let posScheduled = false
    const requestPosition = (): void => {
      if (posScheduled) return
      posScheduled = true
      requestAnimationFrame(() => { posScheduled = false; position() })
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
    // 上次重建时绑定的 user 行集合（render 用行身份判据决定是否重建）。
    let builtRows: HTMLElement[] = []

    interface PinItem { messageId: string; text: string; ts: number; turn?: number }
    let currentSessionId: string | null = null
    // 从任意精选按钮读当前会话 id（PinAction 渲染在聊天视图；聚焦视图
    // 复用缓存值——同一会话内切换视图）。
    const syncSessionId = (): void => {
      const btn = document.querySelector<HTMLElement>('[data-vlln-pin-button][data-session-id]')
      if (btn !== null) currentSessionId = btn.getAttribute('data-session-id') ?? currentSessionId
    }
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
      // 当前会话已精选的回合号集合（聚焦视图按 data-turn-tail 匹配用）。
      turnsOf(sessionId: string): Set<number> {
        const s = new Set<number>()
        for (const p of this.load(sessionId)) if (p.turn !== undefined && Number.isFinite(p.turn)) s.add(p.turn)
        return s
      },
      textOfTurn(sessionId: string, turn: number): string | undefined {
        return this.load(sessionId).find((p) => p.turn === turn)?.text
      },
      // 切换一条精选；返回切换后的状态（true = 已精选）。
      toggle(sessionId: string, messageId: string, text: string, turn?: number): boolean {
        const pins = this.load(sessionId)
        const i = pins.findIndex((p) => p.messageId === messageId)
        if (i >= 0) pins.splice(i, 1)
        else pins.push({ messageId, text, ts: Date.now(), turn })
        localStorage.setItem(this.key(sessionId), JSON.stringify(pins))
        return i < 0
      },
    }


    // 预览：显示消息开头（最多 6 行，CSS line-clamp 截断）。精选轮次显示
    // 被精选回合的上下文文本（pin 时按回合号存入 localStorage；聚焦视图
    // 无行属性，按 data-turn-tail 从 store 读）。
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
        // 优先 localStorage（按回合号，聚焦视图可用）；回退行属性（聊天视图）。
        const turn = Number(pinnedRow.getAttribute('data-turn-tail') ?? NaN)
        const stored = Number.isFinite(turn) && currentSessionId !== null
          ? pinStore.textOfTurn(currentSessionId, turn)
          : undefined
        text = (stored ?? pinnedRow.getAttribute('data-vlln-pin-text') ?? '').trim()
        if (text === '') text = ((row.querySelector('[class*="bubble"]') ?? row).textContent ?? '').trim()
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
    const pinnedRowOf = (all: HTMLElement[], rows: HTMLElement[], i: number, turns: Set<number>): HTMLElement | null => {
      let start = -1
      for (let k = 0; k < all.length; k++) { if (all[k] === rows[i]) { start = k; break } }
      if (start < 0) return null
      const end = i + 1 < rows.length ? all.indexOf(rows[i + 1]) : all.length
      if (end < 0) return null
      for (let k = start; k < end; k++) {
        const row = all[k]!
        // 聊天视图：行属性（PinAction 维护）；聚焦视图：按 data-turn-tail
        // 回合号与 localStorage 精选集匹配（两视图同一会话数据，回合号一致）。
        if (row.hasAttribute('data-vlln-pinned')) return row
        const turn = Number(row.getAttribute('data-turn-tail') ?? NaN)
        if (Number.isFinite(turn) && turns.has(turn)) return row
      }
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
      // 精选轮次：每 user 行对应的 assistant 区间内是否有精选行。先从精选
      // 按钮同步当前会话 id，再算已精选回合集（聚焦视图按回合号匹配）。
      const all = allRows()
      syncSessionId()
      const pinnedTurns = currentSessionId !== null ? pinStore.turnsOf(currentSessionId) : new Set<number>()
      const pinnedRowOfTurn = (i: number): HTMLElement | null => pinnedRowOf(all, rows, i, pinnedTurns)
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
      // 重建判据：行元素身份逐一相等（会话切换/流重建后行换新，数量相同
      // 也不该走快速路径——否则 dot 残留旧行绑定）+ 当前子元素数与应建
      // 结构一致（窗口滑到端点/精选扩展变化时结构增减也要重建）。
      const expectedCount = hi - lo + 1 + (lo > 0 ? 1 : 0) + (hi < rows.length - 1 ? 1 : 0)
      const sameRows = rows.length === builtRows.length && rows.every((row, i) => row === builtRows[i])
      if (sameRows && bar.childElementCount === expectedCount) {
        // 行与结构未变：只移动激活态（重建会重挂 dot，滚动时不应重建）。
        updateActiveClass(active)
        // pin/unpin 不改变点数时也需同步精选 class（否则非窗口模式下
        // 点击精选按钮后金色盘不出现）。
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
        const pinnedRow = pinnedRowOfTurn(i)
        // aria-label 而非 title：title 会叠加浏览器原生 tooltip（与预览卡
        // 重复）；aria-label 不显示 tooltip 但保留可访问名。
        dot.setAttribute('aria-label', `user #${i + 1}${pinnedRow !== null ? '（已精选）' : ''}（点击跳转）`)
        // 窗口内序号（第 p 个 dot ↔ 行 lo+p）。事件触发时用当前 lo 动态
        // 解析行——窗口滑动不重建时也能命中正确消息（无过期闭包）。
        const p = i - lo
        // hover 由导航条级 mousemove 统一处理（整条连续交互，间隙无死区）；
        // 药丸只保留键盘 focus/blur 与点击。
        dot.addEventListener('focus', () => {
          const row = userRows()[lo + p]
          if (row !== undefined) showPreview(row, dot, pinnedRowOfTurn(lo + p))
        })
        dot.addEventListener('blur', hidePreview)
        dot.addEventListener('click', () => {
          // 精选轮次点击直达被精选的回复（否则维持跳 user 行）。
          const row = userRows()[lo + p]
          if (row !== undefined) jumpToRow(pinnedRowOfTurn(lo + p) ?? row)
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
      builtRows = rows
    }

    // 点击跳转（0811 适配）：官方 follow 的读者输入判定已从 wheel 起源
    // 改为 observedTop 账本——onScroll 里 movedByReader =
    // |scrollTop - observedTop| > 0.5，程序化写入 scrollTop 即视为读者
    // 输入；目标不在底部阈值内时 atBottomRef 解除，后续 tipMoved 不再
    // 拉回。因此直接一步写入目标位置即可，无需 0808 时代的 wheel hack
    // + 1px 起步（1px 起步在底部时 isAtBottom 仍 true，流式内容一到就
    // 被拉回——「只上移一点点」bug 根因）。保留 wheel dispatch 作为
    // 旧基线（0808/0810 wheel 起源判定）的兼容手段。
    const jumpToRow = (row: HTMLElement): void => {
      const scroller = scrollerOf()
      if (scroller === null) return
      scroller.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -1, bubbles: true, cancelable: true,
      }))
      const target = scroller.scrollTop + row.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      // 一步到位（0811 账本判定为读者输入，无拉回）；旧基线保留 wheel 兜底。
      scroller.scrollTop = target
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
        sizeObserver = new ResizeObserver(() => { requestPosition() })
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
    window.addEventListener('resize', requestPosition)
    // 滚动监听：重算激活态（rAF 节流，scroll 与 IO 共用）。
    let scrollScheduled = false
    const runUpdate = (): void => {
      scrollScheduled = false
      updateActive()
    }
    const onScroll = (): void => {
      if (scrollScheduled) return
      scrollScheduled = true
      requestAnimationFrame(runUpdate)
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
        requestAnimationFrame(runUpdate)
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
        // 流元素身份变化（Chat ↔ 聚焦视图切换）：重绑 IntersectionObserver
        // 观察新视图的 user 行，激活药丸无需等下一次滚动即正确。
        bindIO()
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

    // 最近节点：按鼠标 Y 取垂直最近药丸（窗口内第 i 个 dot 对应行
    // lo+i，与 render 的窗口映射一致）。hover 预览与整条点击共用。
    const nearestDot = (y: number): { dot: HTMLElement; row: HTMLElement } | null => {
      const dots = [...bar.querySelectorAll<HTMLElement>('[data-vlln-dot]')]
      if (dots.length === 0) return null
      let best: HTMLElement | null = null
      let bestDist = Number.POSITIVE_INFINITY
      for (const dot of dots) {
        const r = dot.getBoundingClientRect()
        const d = Math.abs(r.top + r.height / 2 - y)
        if (d < bestDist) { bestDist = d; best = dot }
      }
      if (best === null) return null
      const row = userRows()[lo + dots.indexOf(best)]
      if (row === undefined) return null
      return { dot: best, row }
    }
    // hover 生效范围：只在节点串垂直范围内（首药丸顶缘～末药丸底缘）。
    // bar 上下 padding / 端点细点区不响应——否则光标落在空隙里会把边缘
    // 药丸拉长，看起来像"最下方/最上方凭空多出一个药丸"。点击仍整条可点。
    const hoverableDot = (y: number): { dot: HTMLElement; row: HTMLElement } | null => {
      const dots = [...bar.querySelectorAll<HTMLElement>('[data-vlln-dot]')]
      if (dots.length === 0) return null
      const first = dots[0]!.getBoundingClientRect()
      const last = dots[dots.length - 1]!.getBoundingClientRect()
      if (y < first.top - 1 || y > last.bottom + 1) return null
      return nearestDot(y)
    }

    // 连续悬停：整条导航条（含药丸间隙/padding/端点细点）都响应 hover——
    // 按鼠标 Y 取垂直最近药丸：弹预览 + 该药丸加长（灰色）指示点击落点，
    // 相邻节点在中点切换，无死区。rAF 节流。
    let hoverScheduled = false
    let hoverRow: HTMLElement | null = null
    let hoverAnchor: HTMLElement | null = null
    let hoverDotEl: HTMLElement | null = null
    // 最新鼠标 Y：每次 mousemove 都更新（即使 rAF 挂起中）。rAF 处理时用
    // 最新值而非触发时捕获的旧值——否则鼠标在 rAF 挂起期间移动 + 期间
    // 发生重建时，会用旧 Y 对重建后的新布局算最近节点，把底部药丸加长
    // 而鼠标其实在别处（偶发"底部幻影药丸"）。
    let lastHoverY: number | null = null
    const setHoverDot = (dot: HTMLElement | null): void => {
      if (hoverDotEl === dot) return
      hoverDotEl?.classList.remove('hover')
      hoverDotEl = dot
      dot?.classList.add('hover')
    }
    // hover 处理（预览 + 加长）。重建后也用它按最新 Y 恢复（重建会清掉
    // dot 的 hover class；鼠标未动时下一次 mousemove 不会到来）。
    const applyHover = (y: number): void => {
      const hit = hoverableDot(y)
      setHoverDot(hit !== null ? hit.dot : null)
      if (hit === null) {
        // 移出节点串范围（上下 padding/端点细点区）：清掉残留预览。
        hoverRow = null
        hoverAnchor = null
        hidePreview()
        return
      }
      if (hoverRow === hit.row && hoverAnchor === hit.dot) return
      hoverRow = hit.row
      hoverAnchor = hit.dot
      // 悬停精选节点：预览该回合精选上下文（pinnedRowOf 取精选行）。
      const dots = [...bar.querySelectorAll<HTMLElement>('[data-vlln-dot]')]
      const turns = currentSessionId !== null ? pinStore.turnsOf(currentSessionId) : new Set<number>()
      const pinned = pinnedRowOf(allRows(), userRows(), lo + dots.indexOf(hit.dot), turns)
      showPreview(hit.row, hit.dot, pinned)
    }
    const onBarMove = (e: MouseEvent): void => {
      lastHoverY = e.clientY
      if (hoverScheduled) return
      hoverScheduled = true
      requestAnimationFrame(() => {
        hoverScheduled = false
        if (lastHoverY !== null) applyHover(lastHoverY)
      })
    }
    bar.addEventListener('mousemove', onBarMove)
    bar.addEventListener('mouseleave', () => {
      lastHoverY = null
      setHoverDot(null)
      hoverRow = null
      hoverAnchor = null
      hidePreview()
    })

    // 整条导航条可点：点击任意位置（含间隙/padding/端点细点）跳到最近
    // 节点——不再需要精确瞄准 7px 小圆点。药丸自身点击仍走各自 handler
    // （精确命中 + 键盘激活）。
    bar.addEventListener('click', (e) => {
      const t = e.target as HTMLElement | null
      if (t !== null && t.closest('[data-vlln-dot]') !== null) return
      const hit = nearestDot(e.clientY)
      if (hit === null) return
      // 整条点击同样尊重精选语义：命中精选轮次则直达被精选的回复。
      const dots = [...bar.querySelectorAll<HTMLElement>('[data-vlln-dot]')]
      const turns = currentSessionId !== null ? pinStore.turnsOf(currentSessionId) : new Set<number>()
      const pinned = pinnedRowOf(allRows(), userRows(), lo + dots.indexOf(hit.dot), turns)
      jumpToRow(pinned ?? hit.row)
    })

    // 滚轮切换：光标在导航条上时，向上滚=上一条、向下滚=下一条；preventDefault
    // 阻止对话区滚动。节流（120ms）防一次滚轮脉冲连跳多条。
    let lastWheelAt = 0
    bar.addEventListener('wheel', (e) => {
      e.preventDefault()
      const now = performance.now()
      if (now - lastWheelAt < 120) return
      lastWheelAt = now
      const rows = userRows()
      if (rows.length < 2) return
      const base = activeIndex >= 0 ? activeIndex : computeActive()
      if (base < 0) return
      const next = Math.min(rows.length - 1, Math.max(0, base + (e.deltaY > 0 ? 1 : -1)))
      if (next === base) return
      jumpToRow(rows[next])
    }, { passive: false })

    // ─── pin 精选 ──────────────────────────────────────────────────
    // 精选状态：按会话持久化到 localStorage（PinItem 含回合号 turn），DOM
    // 属性（data-vlln-pinned / data-vlln-pin-text）只是聊天视图的投影。
    // 聚焦视图（dsh-focus-chat）不渲染 PinAction、无行属性——导航条按
    // data-turn-tail 回合号与 localStorage 匹配，两视图一致显示精选。
    // pin 时的上下文文本：回复正文在折叠态不在 DOM（turnTail 只渲染统计行
    // + 操作条，assistantText 只在 copy 闭包里），取该回合的 user 消息文本
    // （向前找最近的 user 行气泡）作为精选上下文。
    const pinRowText = (button: HTMLElement | null): string => {
      let el: HTMLElement | null = button?.closest('[data-time-hover-root]') ?? null
      while (el !== null) {
        const bubble = el.querySelector('[class*="bubble"]')
        if (el.hasAttribute('data-time-hover-root') && bubble !== null) {
          const text = ((bubble ?? el).textContent ?? '').trim()
          return text.length > 160 ? `${text.slice(0, 160)}…` : text
        }
        el = el.previousElementSibling as HTMLElement | null
      }
      return ''
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
          'data-session-id': sessionId,
          'data-active': active || undefined,
          'aria-pressed': active,
          'aria-label': label,
          title: label,
          onClick: () => {
            const text = pinRowText(ref.current)
            // 回合号：按钮所在行（turnTail）的 data-turn-tail；聚焦视图按
            // 它匹配精选（两视图同一会话数据，回合号一致）。
            const turn = Number(ref.current?.closest('[data-time-hover-root]')?.getAttribute('data-turn-tail') ?? NaN)
            const next = pinStore.toggle(sessionId, messageId, text, Number.isFinite(turn) ? turn : undefined)
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
      window.removeEventListener('resize', requestPosition)
      bar.remove()
      preview.remove()
      document.getElementById(STYLE_ID)?.remove()
    }
  },
}
