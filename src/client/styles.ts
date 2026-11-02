/**
 * The monitor's stylesheet.
 *
 * Plain CSS with a `dsm-` prefix, injected once per document from the bundle's
 * factory body — the client module system claims that tag and removes it when
 * the plugin is disabled. Every colour is a `--dsw-alias-*` token or a
 * `color-mix` of one, so light and dark both follow the active theme; the only
 * fallbacks are neutral greys inside `var(..., #…)`.
 *
 * The page owns its own scroll container and a centred 960px column, and its
 * header owns the top clearance the frame publishes.
 *
 * @module dsh-session-monitor/client/styles
 */

/** Id of the stylesheet tag, so injection stays idempotent. */
export const STYLE_ID = 'dsh-session-monitor-style'

/** The complete stylesheet. */
export const PANEL_CSS = `
.dsm-page{display:flex;flex:1 1 auto;flex-direction:column;box-sizing:border-box;height:100%;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);color-scheme:light dark}
.dsm-inner{display:flex;flex:1 1 auto;flex-direction:column;gap:16px;box-sizing:border-box;width:100%;min-height:0;padding:0 clamp(20px,2.2vw,32px) 16px}

.dsm-header{display:flex;flex:none;flex-direction:column;gap:4px;padding-top:28px}
[data-platform=darwin] .dsm-header{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
.dsm-titleRow{display:flex;align-items:baseline;gap:0;flex-wrap:wrap}
.dsm-title{margin:0;font-size:20px;font-weight:500;line-height:28px}
.dsm-chip{margin-left:6px;padding:1px 8px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:999px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-caption);font-size:12px;font-weight:500;line-height:18px;white-space:nowrap;font-variant-numeric:tabular-nums}
.dsm-intro{margin:0;max-width:64ch;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}

.dsm-toolbar{display:flex;flex:none;align-items:center;gap:8px;flex-wrap:wrap}
.dsm-stat{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:999px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:500;line-height:18px;white-space:nowrap}
.dsm-stat[data-tone=waiting]{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent)}
.dsm-stat[data-tone=running]{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 8%,transparent)}
.dsm-spacer{flex:1 1 auto}
.dsm-btn{flex:none;height:28px;padding:0 10px;font:inherit;font-size:12.5px;line-height:26px;color:inherit;background:none;border:0;border-radius:8px;cursor:pointer;white-space:nowrap}
.dsm-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsm-btn:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}
.dsm-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)}
.dsm-btn:disabled{opacity:.45;cursor:default}
.dsm-btn[data-primary=true]{font-weight:500;color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-primary-fill)}
.dsm-btn[data-primary=true]:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.dsm-btn[data-danger=true]{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dsm-btn[data-danger=true]:hover:not(:disabled){color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 18%,transparent)}
.dsm-select{height:28px;padding:0 6px;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform);border:0.5px solid var(--dsw-alias-border-l3);border-radius:8px}
.dsm-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)}

.dsm-grid{display:grid;flex:1 1 auto;gap:12px;min-height:0;min-width:0}
.dsm-card{display:flex;flex-direction:column;box-sizing:border-box;height:100%;min-height:0;overflow:hidden;container-type:inline-size;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dsm-card[data-state=waiting]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,var(--dsw-alias-border-l2))}
.dsm-cardHead{display:flex;flex:none;align-items:center;gap:6px;padding:5px 6px 5px 9px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsm-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
.dsm-dot[data-state=running]{background:var(--dsw-alias-state-business-primary);animation:dsm-pulse 1.8s ease-out infinite}
.dsm-dot[data-state=waiting]{background:var(--dsw-alias-state-warn-primary);animation:dsm-blink 1.4s ease-in-out infinite}
.dsm-cardHeadText{display:flex;flex-direction:column;min-width:0;flex:1 1 auto}
.dsm-cardTitle{font-size:12.5px;font-weight:600;line-height:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsm-cardOpen{display:block;width:100%;box-sizing:border-box;margin:0;padding:0;text-align:left;font:inherit;font-size:12.5px;font-weight:600;line-height:17px;color:inherit;background:none;border:0;cursor:pointer}
.dsm-cardOpen:hover{text-decoration:underline}
.dsm-cardOpen:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;border-radius:4px}
.dsm-cardSub{display:flex;align-items:baseline;min-width:0;font-size:10px;line-height:14px;color:var(--dsw-alias-label-caption);white-space:nowrap;overflow:hidden}
.dsm-cardSub>span{flex:none}
.dsm-cardSub>span+span::before{content:"·";margin:0 5px;color:var(--dsw-alias-label-caption)}
.dsm-cardWorkspace{flex:0 1 auto!important;min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-primary);font-weight:500}
.dsm-iconBtn{flex:none;display:grid;place-items:center;width:24px;height:24px;padding:0;color:var(--dsw-alias-label-tertiary);background:none;border:0;border-radius:999px;cursor:pointer}
.dsm-iconBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.dsm-iconBtn[data-danger=true]:hover{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.dsm-iconBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)}

.dsm-body{display:flex;flex-direction:column;gap:5px;flex:1 1 auto;min-height:0;overflow:auto;padding:6px 10px;scrollbar-width:none}
.dsm-body::-webkit-scrollbar{display:none;width:0;height:0}
.dsm-hint{padding:4px 0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:18px;color:var(--dsw-alias-label-caption)}
.dsm-hint[data-tone=error]{color:var(--dsw-alias-state-error-primary)}

.dsm-user{max-width:100%;padding:5px 8px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 8%,transparent);font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));white-space:pre-wrap;overflow-wrap:anywhere}
.dsm-assistant{max-width:100%;font-size:var(--dsh-content-font-size,14px);line-height:calc(24px + var(--dsh-content-font-delta,0px));white-space:pre-wrap;overflow-wrap:anywhere}
.dsm-assistant[data-live=true]::after{content:"";display:inline-block;width:5px;height:12px;margin-left:2px;vertical-align:-2px;background:var(--dsw-alias-state-business-primary);animation:dsm-blink 1.1s ease-in-out infinite}
.dsm-tool{display:flex;align-items:baseline;gap:6px;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:var(--dsh-content-font-size-secondary,13px);line-height:20px;color:var(--dsw-alias-label-tertiary)}
.dsm-toolName{flex:none;color:var(--dsw-alias-label-secondary);font-weight:600}
.dsm-toolDetail{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsm-tool[data-status=error] .dsm-toolName{color:var(--dsw-alias-state-error-primary)}
.dsm-toolDot{flex:none;width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
.dsm-tool[data-status=running] .dsm-toolDot{background:var(--dsw-alias-state-business-primary);animation:dsm-blink 1.2s ease-in-out infinite}
.dsm-tool[data-status=done] .dsm-toolDot{background:var(--dsw-alias-state-success-primary)}
.dsm-tool[data-status=error] .dsm-toolDot{background:var(--dsw-alias-state-error-primary)}
.dsm-notice{padding:2px 0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:18px;color:var(--dsw-alias-label-caption)}
.dsm-notice[data-tone=error]{color:var(--dsw-alias-state-error-primary)}

.dsm-pending{display:flex;flex-direction:column;gap:4px;flex:none;margin:0 0 4px;padding:6px 8px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 7%,var(--dsw-alias-bg-layer-2))}
.dsm-pendingTitle{font-size:10px;font-weight:650;line-height:14px;letter-spacing:.02em;color:var(--dsw-alias-state-warn-primary)}
.dsm-pendingReason{margin:0;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere}
.dsm-question{display:flex;flex-direction:column;gap:4px}
.dsm-questionHeader{font-size:9.5px;font-weight:650;line-height:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-caption)}
.dsm-questionText{margin:0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere}
.dsm-options{display:flex;flex-wrap:wrap;gap:4px}
.dsm-option{max-width:100%;padding:3px 8px;font:inherit;font-size:11px;line-height:15px;text-align:left;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-module-platform);border:0.5px solid var(--dsw-alias-border-l3);border-radius:999px;cursor:pointer}
.dsm-option:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsm-option[aria-pressed=true]{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary)}
.dsm-option:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)}
.dsm-option:disabled{opacity:.5;cursor:default}
.dsm-answerInput{flex:1 1 auto;min-width:120px;height:24px;padding:0 7px;font:inherit;font-size:11px;color:inherit;background:var(--dsw-alias-bg-module-platform);border:0.5px solid var(--dsw-alias-border-l3);border-radius:8px}
.dsm-answerInput:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)}
.dsm-pendingActions{position:sticky;bottom:0;z-index:1;display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:2px;padding-top:4px;border-top:0.5px solid var(--dsw-alias-border-l3);background:inherit}
.dsm-pending .dsm-btn{height:24px;padding:0 9px;font-size:11.5px;line-height:22px}
.dsm-pendingError{font-size:11px;line-height:16px;color:var(--dsw-alias-state-error-primary)}

.dsm-composer{display:flex;flex-direction:column;gap:5px;flex:none;padding:5px 9px 6px;border-top:1px solid var(--dsw-alias-border-l1)}
.dsm-input{flex:1 1 auto;min-width:0;box-sizing:border-box;min-height:26px;max-height:64px;padding:4px 7px;resize:none;font:inherit;font-size:12.5px;line-height:18px;color:inherit;background:var(--dsw-alias-bg-module-platform);border:0.5px solid var(--dsw-alias-border-l3);border-radius:8px}
.dsm-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)}
.dsm-input::placeholder{color:var(--dsw-alias-label-caption)}
.dsm-composerFoot{display:flex;align-items:center;gap:6px;flex:none;min-width:0}
.dsm-perm{display:inline-flex;align-items:center;gap:4px;flex:none;min-width:0;color:var(--dsw-alias-label-tertiary)}
.dsm-permGlyph{display:inline-flex;flex:none}
.dsm-permSelect{flex:0 1 auto;min-width:0;height:24px;max-width:120px;padding:0 4px;font-size:11px;border-radius:7px;color:var(--dsw-alias-label-secondary)}
.dsm-model{display:inline-flex;align-items:center;flex:0 1 auto;min-width:0;max-width:170px}
.dsm-modelSelect{flex:0 1 auto;min-width:0;height:24px;max-width:170px;padding:0 4px;font-size:11px;border-radius:7px;color:var(--dsw-alias-label-secondary)}
.dsm-permConfirm{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:4px 6px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 8%,transparent)}
.dsm-permConfirmText{flex:1 1 auto;min-width:120px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.dsm-permConfirmActions{display:flex;gap:4px;flex:none}
.dsm-permConfirm .dsm-btn{height:22px;padding:0 8px;font-size:11px;line-height:20px}
.dsm-cardError{display:flex;flex-direction:column;gap:2px;padding:0 12px 8px}
.dsm-queue{display:flex;flex-direction:column;gap:2px;flex:none;padding:4px 9px 5px;border-top:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 4%,transparent)}
.dsm-queueHead{display:flex;align-items:center;gap:5px;font-size:10px;line-height:14px;font-weight:600;color:var(--dsw-alias-label-caption)}
.dsm-queueGlyph{display:inline-flex;flex:none}
.dsm-queueRow{display:flex;align-items:center;gap:6px;min-width:0}
.dsm-queueRow[data-editing=true]{align-items:flex-start}
.dsm-queueText{flex:1 1 auto;min-width:0;font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsm-queueActions{display:flex;align-items:center;gap:1px;flex:none}
.dsm-queueBtn{display:grid;place-items:center;width:20px;height:20px;padding:0;color:var(--dsw-alias-label-tertiary);background:none;border:0;border-radius:6px;cursor:pointer}
.dsm-queueBtn:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.dsm-queueBtn[data-danger=true]:hover:not(:disabled){color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dsm-queueBtn:disabled{opacity:.4;cursor:default}
.dsm-queueBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)}
.dsm-queueEdit{flex:1 1 auto;min-width:0;box-sizing:border-box;min-height:34px;max-height:64px;padding:3px 6px;resize:none;font:inherit;font-size:11.5px;line-height:16px;color:inherit;background:var(--dsw-alias-bg-module-platform);border:0.5px solid var(--dsw-alias-border-l3);border-radius:7px}
.dsm-queueEdit:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)}
.dsm-queueMore{font-size:10.5px;line-height:14px;color:var(--dsw-alias-label-caption)}

.dsm-cardState{color:var(--dsw-alias-label-caption)}
.dsm-cardTime{color:var(--dsw-alias-label-caption)}
@container (max-width:320px){
.dsm-cardTime{display:none}
.dsm-permSelect{max-width:96px}
.dsm-model{max-width:120px}
.dsm-modelSelect{max-width:120px}
}
@container (max-width:210px){
.dsm-cardState{display:none}
.dsm-cardTitle{font-size:12px}
.dsm-permGlyph{display:none}
.dsm-permSelect{max-width:80px}
.dsm-model{max-width:96px}
.dsm-modelSelect{max-width:96px}
}
.dsm-empty{display:flex;flex:1 1 auto;flex-direction:column;align-items:center;justify-content:center;min-height:0;gap:6px;padding:24px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;text-align:center;color:var(--dsw-alias-label-secondary)}
.dsm-emptyTitle{font-size:13px;font-weight:600;line-height:18px;color:var(--dsw-alias-label-primary)}
.dsm-emptyBody{font-size:12px;line-height:18px}

@keyframes dsm-blink{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes dsm-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,transparent)}70%{box-shadow:0 0 0 5px transparent}100%{box-shadow:0 0 0 0 transparent}}
@media (prefers-reduced-motion:reduce){.dsm-dot{animation:none}.dsm-assistant[data-live=true]::after{animation:none}.dsm-toolDot{animation:none}}
`

/** Append the stylesheet once per document. */
export function injectStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-session-monitor'
  style.dataset.pluginCss = STYLE_ID
  style.textContent = PANEL_CSS
  document.head.append(style)
}