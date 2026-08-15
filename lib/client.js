window.__ModuleLoader__.load({
	id: "@vlln/dsh-navbar",
	factory: (require) => {
		var module = { exports: {} };
		module.exports;
		//#endregion
		module.exports = {
			name: "navbar-client",
			apply() {
				const body = document.body;
				if (body === null) return;
				const STYLE_ID = "dsh-navbar-style";
				if (document.getElementById(STYLE_ID) === null) {
					const style = document.createElement("style");
					style.id = STYLE_ID;
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
`;
					document.head.appendChild(style);
				}
				const bar = document.createElement("nav");
				bar.setAttribute("data-dsh-navbar", "");
				bar.setAttribute("aria-label", "用户消息导航");
				body.appendChild(bar);
				const preview = document.createElement("div");
				preview.setAttribute("data-vlln-preview", "");
				preview.style.display = "none";
				body.appendChild(preview);
				const flowOf = () => document.querySelector("[data-chat-flow=\"\"]");
				const scrollerOf = () => {
					const flow = flowOf();
					if (flow === null) return null;
					let n = flow.parentElement;
					while (n !== null) {
						const s = getComputedStyle(n);
						if (s.overflowY === "auto" || s.overflowY === "scroll") return n;
						n = n.parentElement;
					}
					return null;
				};
				const userRows = () => [...document.querySelectorAll("[data-time-hover-root]")].filter((row) => !row.hasAttribute("data-pending-steering") && row.querySelector("[class*=\"bubble\"]") !== null);
				const position = () => {
					const flow = flowOf();
					if (flow === null) return;
					const right = flow.getBoundingClientRect().right;
					const next = Math.round(Math.min(right + 12, window.innerWidth - bar.offsetWidth - 8));
					const nextLeft = `${Math.max(8, next)}px`;
					if (bar.style.left !== nextLeft) bar.style.left = nextLeft;
				};
				let posScheduled = false;
				const requestPosition = () => {
					if (posScheduled) return;
					posScheduled = true;
					requestAnimationFrame(() => {
						posScheduled = false;
						position();
					});
				};
				let activeIndex = -1;
				const computeActive = () => {
					const rows = userRows();
					if (rows.length === 0) return -1;
					let best = 0;
					let found = false;
					let bestTop = Number.POSITIVE_INFINITY;
					for (let i = 0; i < rows.length; i++) {
						const top = rows[i].getBoundingClientRect().top;
						if (top >= 0 && top < bestTop) {
							bestTop = top;
							best = i;
							found = true;
						}
					}
					return found ? best : rows.length - 1;
				};
				const WINDOW = 11;
				const HALF_WINDOW = 5;
				let lo = 0;
				let builtRows = [];
				const positionPreview = (anchor) => {
					const r = anchor.getBoundingClientRect();
					preview.style.right = `${window.innerWidth - r.left + 14}px`;
					preview.style.top = `${Math.min(window.innerHeight - 120, r.top - 12)}px`;
				};
				const showPreview = (row, anchor) => {
					const text = ((row.querySelector("[class*=\"bubble\"]") ?? row).textContent ?? "").trim();
					if (text === "") return;
					preview.textContent = text;
					preview.style.display = "block";
					positionPreview(anchor);
				};
				const hidePreview = () => {
					preview.style.display = "none";
				};
				const render = () => {
					position();
					if (flowOf() === null) {
						bar.style.display = "none";
						return;
					}
					const rows = userRows();
					if (rows.length < 2) {
						bar.style.display = "none";
						return;
					}
					bar.style.display = "flex";
					const active = computeActive();
					activeIndex = active;
					const windowed = rows.length > WINDOW;
					lo = windowed ? Math.max(0, active - HALF_WINDOW) : 0;
					const hi = windowed ? Math.min(rows.length - 1, active + HALF_WINDOW) : rows.length - 1;
					const expectedCount = hi - lo + 1 + (lo > 0 ? 1 : 0) + (hi < rows.length - 1 ? 1 : 0);
					if (rows.length === builtRows.length && rows.every((row, i) => row === builtRows[i]) && bar.childElementCount === expectedCount) {
						updateActiveClass(active);
						return;
					}
					bar.textContent = "";
					if (windowed && lo > 0) {
						const more = document.createElement("span");
						more.setAttribute("data-vlln-more", "");
						bar.appendChild(more);
					}
					for (let i = lo; i <= hi; i++) {
						const dot = document.createElement("button");
						dot.type = "button";
						dot.setAttribute("data-vlln-dot", "");
						dot.setAttribute("aria-label", `user #${i + 1}（点击跳转）`);
						const p = i - lo;
						dot.addEventListener("focus", () => {
							const row = userRows()[lo + p];
							if (row !== void 0) showPreview(row, dot);
						});
						dot.addEventListener("blur", hidePreview);
						dot.addEventListener("click", () => {
							const row = userRows()[lo + p];
							if (row !== void 0) jumpToRow(row);
						});
						if (i === active) dot.classList.add("active");
						bar.appendChild(dot);
					}
					if (windowed && hi < rows.length - 1) {
						const more = document.createElement("span");
						more.setAttribute("data-vlln-more", "");
						bar.appendChild(more);
					}
					builtRows = rows;
				};
				const jumpToRow = (row) => {
					const scroller = scrollerOf();
					if (scroller === null) return;
					scroller.dispatchEvent(new WheelEvent("wheel", {
						deltaY: -1,
						bubbles: true,
						cancelable: true
					}));
					scroller.scrollTop = scroller.scrollTop + row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
				};
				const updateActiveClass = (active) => {
					[...bar.querySelectorAll("[data-vlln-dot]")].forEach((dot, i) => {
						if (i + lo === active) dot.classList.add("active");
						else dot.classList.remove("active");
					});
				};
				const updateActive = () => {
					const next = computeActive();
					if (next === activeIndex) return;
					activeIndex = next;
					render();
				};
				let flow = flowOf();
				let sizeObserver = null;
				const bindFlow = () => {
					const next = flowOf();
					if (next === flow) return false;
					flow = next;
					sizeObserver?.disconnect();
					sizeObserver = null;
					if (flow !== null) {
						sizeObserver = new ResizeObserver(() => {
							requestPosition();
						});
						let el = flow;
						while (el !== null && el !== document.body) {
							sizeObserver.observe(el);
							el = el.parentElement;
						}
					}
					position();
					return true;
				};
				bindFlow();
				window.addEventListener("resize", requestPosition);
				let scrollScheduled = false;
				const runUpdate = () => {
					scrollScheduled = false;
					updateActive();
				};
				let io = null;
				const bindIO = () => {
					io?.disconnect();
					const root = scrollerOf();
					if (root === null) return;
					io = new IntersectionObserver(() => {
						if (scrollScheduled) return;
						scrollScheduled = true;
						requestAnimationFrame(runUpdate);
					}, {
						root,
						rootMargin: "0px 0px -15% 0px",
						threshold: [
							0,
							.25,
							.5,
							.75,
							1
						]
					});
					userRows().forEach((row) => {
						io?.observe(row);
					});
				};
				bindIO();
				render();
				let scheduled = false;
				const schedule = () => {
					if (scheduled) return;
					scheduled = true;
					requestAnimationFrame(() => {
						scheduled = false;
						render();
					});
				};
				const observer = new MutationObserver((mutations) => {
					if (bindFlow()) {
						schedule();
						return;
					}
					bindIO();
					for (const m of mutations) {
						if (m.target === bar || bar.contains(m.target)) continue;
						if (m.target === preview || preview.contains(m.target)) continue;
						if (flow !== null && (m.target === flow || flow.contains(m.target))) {
							schedule();
							return;
						}
					}
				});
				observer.observe(body, {
					childList: true,
					subtree: true
				});
				const nearestDot = (y) => {
					const dots = [...bar.querySelectorAll("[data-vlln-dot]")];
					if (dots.length === 0) return null;
					let best = null;
					let bestDist = Number.POSITIVE_INFINITY;
					for (const dot of dots) {
						const r = dot.getBoundingClientRect();
						const d = Math.abs(r.top + r.height / 2 - y);
						if (d < bestDist) {
							bestDist = d;
							best = dot;
						}
					}
					if (best === null) return null;
					const row = userRows()[lo + dots.indexOf(best)];
					if (row === void 0) return null;
					return {
						dot: best,
						row
					};
				};
				const hoverableDot = (y) => {
					const dots = [...bar.querySelectorAll("[data-vlln-dot]")];
					if (dots.length === 0) return null;
					const first = dots[0].getBoundingClientRect();
					const last = dots[dots.length - 1].getBoundingClientRect();
					if (y < first.top - 1 || y > last.bottom + 1) return null;
					return nearestDot(y);
				};
				let hoverScheduled = false;
				let hoverRow = null;
				let hoverAnchor = null;
				let hoverDotEl = null;
				const setHoverDot = (dot) => {
					if (hoverDotEl === dot) return;
					hoverDotEl?.classList.remove("hover");
					hoverDotEl = dot;
					dot?.classList.add("hover");
				};
				const onBarMove = (e) => {
					if (hoverScheduled) return;
					hoverScheduled = true;
					requestAnimationFrame(() => {
						hoverScheduled = false;
						const hit = hoverableDot(e.clientY);
						setHoverDot(hit !== null ? hit.dot : null);
						if (hit === null) {
							hoverRow = null;
							hoverAnchor = null;
							hidePreview();
							return;
						}
						if (hoverRow === hit.row && hoverAnchor === hit.dot) return;
						hoverRow = hit.row;
						hoverAnchor = hit.dot;
						showPreview(hit.row, hit.dot);
					});
				};
				bar.addEventListener("mousemove", onBarMove);
				bar.addEventListener("mouseleave", () => {
					setHoverDot(null);
					hoverRow = null;
					hoverAnchor = null;
					hidePreview();
				});
				bar.addEventListener("click", (e) => {
					const t = e.target;
					if (t !== null && t.closest("[data-vlln-dot]") !== null) return;
					const hit = nearestDot(e.clientY);
					if (hit !== null) jumpToRow(hit.row);
				});
				let lastWheelAt = 0;
				bar.addEventListener("wheel", (e) => {
					e.preventDefault();
					const now = performance.now();
					if (now - lastWheelAt < 120) return;
					lastWheelAt = now;
					const rows = userRows();
					if (rows.length < 2) return;
					const base = activeIndex >= 0 ? activeIndex : computeActive();
					if (base < 0) return;
					const next = Math.min(rows.length - 1, Math.max(0, base + (e.deltaY > 0 ? 1 : -1)));
					if (next === base) return;
					jumpToRow(rows[next]);
				}, { passive: false });
				return () => {
					observer.disconnect();
					sizeObserver?.disconnect();
					io?.disconnect();
					window.removeEventListener("resize", requestPosition);
					bar.remove();
					preview.remove();
					document.getElementById(STYLE_ID)?.remove();
				};
			}
		};
		return module.exports;
	}
});
