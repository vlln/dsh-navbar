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
// 构建：复制此文件为 client.js 的手写等价物（CJS + ModuleLoader 包装，
// 同 greeter 模式），或按 README.md「构建 client bundle」用 bundler 产出。
export default {
  name: 'navbar-client',
  apply() {
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
  transition: width .22s ease, background .22s ease, transform .22s ease;
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
    const userRows = (): HTMLElement[] =>
      [...document.querySelectorAll<HTMLElement>('[data-time-hover-root]')].filter(row =>
      // user 行 = UserStyleBubble（data-time-hover-root + 气泡结构）；排除
      // assistant/Think 行（body 无 bubble）与 pending steering。
      !row.hasAttribute('data-pending-steering') && row.querySelector('[class*="bubble"]') !== null)

    // 侧边栏：用其独有的 CSS 变量识别（--dsh-sidebar-inline-padding），
    // 找不到时回退到对话流左缘。
    const sidebarOf = (): HTMLElement | null => {
      for (const el of document.querySelectorAll<HTMLElement>('div')) {
        const s = getComputedStyle(el)
        if (s.getPropertyValue('--dsh-sidebar-inline-padding').trim() !== '' && el.offsetWidth > 0) {
          return el
        }
      }
      return null
    }

    // 位置：紧靠侧边栏右缘 + 8px；无侧边栏则贴对话流左缘。
    const position = (): void => {
      const flow = flowOf()
      if (flow === null) return
      const sidebar = sidebarOf()
      const anchor = sidebar !== null ? sidebar.getBoundingClientRect().right : flow.getBoundingClientRect().left
      const next = Math.round(Math.max(anchor + 8, 8))
      const nextLeft = `${next}px`
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

    // 预览：显示消息开头（最多 6 行，CSS line-clamp 截断）。
    const positionPreview = (anchor: HTMLElement): void => {
      const r = anchor.getBoundingClientRect()
      // 预览卡出现在节点右侧（贴 dot 右缘 + 14px）。
      preview.style.left = `${r.right + 14}px`
      preview.style.top = `${Math.min(window.innerHeight - 120, r.top - 12)}px`
    }
    const showPreview = (row: HTMLElement, anchor: HTMLElement): void => {
      // 消息文本 = 气泡内文本（排除时间戳/操作按钮/分支提示——整行
      // textContent 会混入 actions 和官方提示文案）；CSS line-clamp 6 行
      // 截断。立即显示（导航点小、hover 精确，无需 session list 行的
      // 500ms 防误触延迟）。
      const bubble = row.querySelector('[class*="bubble"]')
      const text = ((bubble ?? row).textContent ?? '').trim()
      if (text === '') return
      preview.textContent = text
      preview.style.display = 'block'
      positionPreview(anchor)
    }
    const hidePreview = (): void => { preview.style.display = 'none' }

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
      // 窗口：>11 节点时截断（显示激活附近一段），端点细点暗示还有更多。
      const windowed = rows.length > WINDOW
      lo = windowed ? Math.max(0, active - HALF_WINDOW) : 0
      const hi = windowed ? Math.min(rows.length - 1, active + HALF_WINDOW) : rows.length - 1
      // 重建（点数/窗口变化时才重建；滚动只走 updateActive 不重建）。
      const dotCount = hi - lo + 1 + (windowed ? 2 : 0) // +2 端点细点
      if (bar.childElementCount === dotCount && rows.length >= 2) {
        // 窗口未变：只移动激活态（重建会重挂 dot，滚动时不应重建）。
        updateActiveClass(active)
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
        // aria-label 而非 title：title 会叠加浏览器原生 tooltip（与预览卡
        // 重复）；aria-label 不显示 tooltip 但保留可访问名。
        dot.setAttribute('aria-label', `user #${i + 1}（点击跳转）`)
        const row = rows[i]!
        dot.addEventListener('mouseenter', () => showPreview(row, dot))
        dot.addEventListener('mouseleave', hidePreview)
        dot.addEventListener('focus', () => showPreview(row, dot))
        dot.addEventListener('blur', hidePreview)
        dot.addEventListener('click', () => {
          jumpToRow(row)
        })
        if (i === active) dot.classList.add('active')
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
