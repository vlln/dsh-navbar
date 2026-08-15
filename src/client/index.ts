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
  background: rgba(128, 128, 140, .45); cursor: pointer; flex: none; position: relative;
  transition: width .22s ease, background .22s ease, transform .22s ease;
}
/* 命中区放大：视觉药丸仍 7px，::after 向四周扩 6px（19px 热区），布局零变化。 */
[data-vlln-dot]::after {
  content: ''; position: absolute; inset: -6px; border-radius: 999px;
}
[data-vlln-dot]:hover { background: var(--dsw-alias-interactive-bg-hover); transform: scale(1.25); }
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

    // 预览：显示消息开头（最多 6 行，CSS line-clamp 截断）。
    const positionPreview = (anchor: HTMLElement): void => {
      const r = anchor.getBoundingClientRect()
      // right 定位：卡片右缘贴 dot 左缘 - 14px（内容短的卡片也贴紧）。
      preview.style.right = `${window.innerWidth - r.left + 14}px`
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
      // 重建判据：行元素身份逐一相等（会话切换/流重建后行换新，数量相同
      // 也不该走快速路径——否则 dot 残留旧行绑定）+ 当前子元素数与应建
      // 结构一致（窗口滑到端点时端点细点增减也要重建）。
      const expectedCount = hi - lo + 1 + (lo > 0 ? 1 : 0) + (hi < rows.length - 1 ? 1 : 0)
      const sameRows = rows.length === builtRows.length && rows.every((row, i) => row === builtRows[i])
      if (sameRows && bar.childElementCount === expectedCount) {
        // 行与结构未变：只移动激活态（重建会重挂 dot，滚动时不应重建）。
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
        // 窗口内序号（第 p 个 dot ↔ 行 lo+p）。事件触发时用当前 lo 动态
        // 解析行——窗口滑动不重建时也能命中正确消息（无过期闭包）。
        const p = i - lo
        // hover 由导航条级 mousemove 统一处理（整条连续交互，间隙无死区）；
        // 药丸只保留键盘 focus/blur 与点击。
        dot.addEventListener('focus', () => {
          const row = userRows()[lo + p]
          if (row !== undefined) showPreview(row, dot)
        })
        dot.addEventListener('blur', hidePreview)
        dot.addEventListener('click', () => {
          const row = userRows()[lo + p]
          if (row !== undefined) jumpToRow(row)
        })
        if (i === active) dot.classList.add('active')
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
    const setHoverDot = (dot: HTMLElement | null): void => {
      if (hoverDotEl === dot) return
      hoverDotEl?.classList.remove('hover')
      hoverDotEl = dot
      dot?.classList.add('hover')
    }
    const onBarMove = (e: MouseEvent): void => {
      if (hoverScheduled) return
      hoverScheduled = true
      requestAnimationFrame(() => {
        hoverScheduled = false
        const hit = hoverableDot(e.clientY)
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
        showPreview(hit.row, hit.dot)
      })
    }
    bar.addEventListener('mousemove', onBarMove)
    bar.addEventListener('mouseleave', () => {
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
      if (hit !== null) jumpToRow(hit.row)
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
