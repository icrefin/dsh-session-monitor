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
.dsm-budget{display:inline-flex;align-items:center;gap:6px;flex:none}
.dsm-budgetLabel{font-size:11px;font-weight:500;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsm-stepper{display:inline-flex;align-items:stretch;height:28px;box-sizing:border-box;overflow:hidden;background:var(--dsw-alias-bg-module-platform);border:0.5px solid var(--dsw-alias-border-l3);border-radius:8px}
.dsm-stepperBtn{display:grid;place-items:center;width:24px;padding:0;font:inherit;font-size:14px;line-height:1;color:var(--dsw-alias-label-secondary);background:none;border:0;cursor:pointer}
.dsm-stepperBtn:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.dsm-stepperBtn:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}
.dsm-stepperBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsm-stepperBtn:disabled{opacity:.4;cursor:default}
.dsm-stepperValue{box-sizing:border-box;width:36px;padding:0;font:inherit;font-size:12px;font-weight:500;line-height:26px;text-align:center;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);background:none;border:0;border-left:0.5px solid var(--dsw-alias-border-l3);border-right:0.5px solid var(--dsw-alias-border-l3);appearance:textfield;-moz-appearance:textfield}
.dsm-stepperValue::-webkit-outer-spin-button,.dsm-stepperValue::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.dsm-stepperValue:focus-visible{color:var(--dsw-alias-label-primary);outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}

.dsm-newSession{display:flex;align-items:center;gap:6px;flex:none;min-width:0}
.dsm-newGlyph{display:inline-flex;flex:none;align-items:center;vertical-align:-2px;margin-right:5px}
.dsm-newWorkspace{flex:0 1 auto;min-width:120px;max-width:220px;color:var(--dsw-alias-label-secondary)}
.dsm-newStatus{flex:0 1 auto;min-width:0;max-width:44ch;padding:2px 9px;border-radius:999px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;overflow-wrap:anywhere}
.dsm-newStatus[data-tone=error]{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}
.dsm-divider{flex:none;width:1px;height:16px;margin:0 2px;background:var(--dsw-alias-border-l2)}

.dsm-grid{display:grid;flex:1 1 auto;gap:12px;min-height:0;min-width:0}
.dsm-grid[data-mode=flow]{overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-gutter:stable}
/* The head stack runs one step above the transcript: the title is the content
   size plus 4px (18px at the 14px default), and the workspace/state/time line
   below it is exactly 1.5x smaller than that title (12px), so both keep
   following the global content font setting together. */
.dsm-card{display:flex;flex-direction:column;box-sizing:border-box;height:100%;min-height:0;overflow:hidden;container-type:inline-size;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);--dsm-card-title-size:calc(var(--dsh-content-font-size,14px) + 4px);--dsm-card-sub-size:calc(var(--dsm-card-title-size) / 1.5)}
.dsm-card[data-state=waiting]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,var(--dsw-alias-border-l2))}
.dsm-cardHead{display:flex;flex:none;align-items:center;gap:6px;padding:5px 6px 5px 9px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsm-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
.dsm-dot[data-state=running]{background:var(--dsw-alias-state-business-primary);animation:dsm-pulse 1.8s ease-out infinite}
.dsm-dot[data-state=waiting]{background:var(--dsw-alias-state-warn-primary);animation:dsm-blink 1.4s ease-in-out infinite}
.dsm-dot[data-state=completed]{background:var(--dsw-alias-state-success-primary)}
.dsm-cardHeadText{display:flex;flex-direction:column;min-width:0;flex:1 1 auto}
.dsm-cardTitle{font-size:var(--dsm-card-title-size);font-weight:600;line-height:calc(24px + var(--dsh-content-font-delta,0px));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsm-cardOpen{display:block;width:100%;box-sizing:border-box;margin:0;padding:0;text-align:left;font:inherit;font-size:var(--dsm-card-title-size);font-weight:600;line-height:calc(24px + var(--dsh-content-font-delta,0px));color:inherit;background:none;border:0;cursor:pointer}
.dsm-cardOpen:hover{text-decoration:underline}
.dsm-cardOpen:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;border-radius:4px}
.dsm-cardSub{display:flex;align-items:baseline;min-width:0;font-size:var(--dsm-card-sub-size);line-height:calc(16px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-caption);white-space:nowrap;overflow:hidden}
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
.dsm-composerFoot{display:flex;align-items:center;gap:6px;flex:none;flex-wrap:wrap;row-gap:4px;min-width:0}
.dsm-footerActions{display:flex;align-items:center;gap:6px;flex:none;margin-left:auto}
.dsm-usage{display:inline-flex;align-items:center;gap:6px;flex:none;min-width:0;font-size:10px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.dsm-usageStat{flex:none}
.dsm-usageStat+.dsm-usageStat::before{content:"·";margin-right:6px;opacity:.7}
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
.dsm-permGlyph{display:none}
.dsm-permSelect{max-width:80px}
.dsm-model{max-width:96px}
.dsm-modelSelect{max-width:96px}
}
.dsm-empty{display:flex;flex:1 1 auto;flex-direction:column;align-items:center;justify-content:center;min-height:0;gap:6px;padding:24px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;text-align:center;color:var(--dsw-alias-label-secondary)}
.dsm-emptyTitle{font-size:13px;font-weight:600;line-height:18px;color:var(--dsw-alias-label-primary)}
.dsm-emptyBody{font-size:12px;line-height:18px}
.dsm-failed{display:flex;flex:0 0 auto;flex-direction:column;align-items:flex-start;gap:8px;box-sizing:border-box;max-width:62ch;margin:auto;padding:20px 22px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-module-platform);text-align:left}
.dsm-failedTitle{font-size:14px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}
.dsm-failedBody{margin:0;font-size:12.5px;line-height:19px;color:var(--dsw-alias-label-secondary)}
.dsm-failedBody[data-detail=true]{font-family:var(--dsh-code-font-family,ui-monospace,monospace);font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}
.dsm-failedActions{display:flex;align-items:center;gap:8px;margin-top:2px}

@keyframes dsm-blink{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes dsm-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,transparent)}70%{box-shadow:0 0 0 5px transparent}100%{box-shadow:0 0 0 0 transparent}}
@media (prefers-reduced-motion:reduce){.dsm-dot{animation:none}.dsm-assistant[data-live=true]::after{animation:none}.dsm-toolDot{animation:none}}

/* ── View switch and the flow mode card chrome ───────────────────────────── */
.dsm-modes{display:inline-flex;align-items:stretch;flex:none;height:28px;box-sizing:border-box;padding:2px;gap:2px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-module-platform)}
.dsm-modeBtn{height:24px;padding:0 10px;font:inherit;font-size:12px;line-height:24px;color:var(--dsw-alias-label-secondary);background:none;border:0;border-radius:6px;cursor:pointer;white-space:nowrap}
.dsm-modeBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.dsm-modeBtn:active{background:var(--dsw-alias-interactive-bg-active)}
.dsm-modeBtn[aria-pressed=true]{font-weight:500;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);box-shadow:0 0 0 0.5px var(--dsw-alias-border-l2)}
.dsm-modeBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
/* In flow mode the card borrows the progress panel ground, and the flow body
   fills the height the card header leaves. The state and the clock move into
   the flow header, so the card own duplicate line is hidden. */
.dsm-card[data-mode=flow]{background:var(--dsw-alias-bg-base)}
.dsm-card[data-mode=flow] .dsm-cardState,.dsm-card[data-mode=flow] .dsm-cardTime{display:none}
.dsm-card[data-mode=flow] .dsf-root{flex:1 1 auto;height:auto;min-height:0}
.dsf-body .dsm-pending{margin:0 0 6px}

/* ── The flow view (dsh-session-progress, embedded) ──────────────────────── */

.dsf-root{display:flex;flex-direction:column;box-sizing:border-box;height:100%;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary);background:transparent;color-scheme:light dark;container-type:inline-size;font-size:12.5px;line-height:18px}

.dsf-head{display:flex;flex:none;flex-direction:column;gap:7px;padding:11px 12px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsf-statusRow{display:flex;align-items:center;gap:8px;min-width:0}
.dsf-status{display:inline-flex;align-items:center;gap:6px;flex:none;padding:2px 9px 2px 8px;border-radius:999px;font-size:11px;font-weight:500;line-height:16px;white-space:nowrap;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform)}
.dsf-statusDot{flex:none;width:6px;height:6px;border-radius:50%;background:currentColor}
.dsf-status[data-tone=running]{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent)}
.dsf-status[data-tone=running] .dsf-statusDot{animation:dsf-pulse 1.8s ease-out infinite}
.dsf-status[data-tone=waiting]{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 11%,transparent)}
.dsf-status[data-tone=waiting] .dsf-statusDot{animation:dsf-blink 1.4s ease-in-out infinite}
.dsf-status[data-tone=done]{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 9%,transparent)}
.dsf-status[data-tone=failed]{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dsf-spacer{flex:1 1 auto;min-width:0}
.dsf-turn{flex:none;font-size:11px;line-height:16px;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;white-space:nowrap}
.dsf-elapsed{flex:none;font-size:11px;line-height:16px;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;white-space:nowrap}
.dsf-elapsed::before{content:"";display:inline-block;width:1px;height:9px;margin-right:7px;vertical-align:0;background:var(--dsw-alias-border-l2)}

.dsf-currentPrompt{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:0;padding:5px 9px;border-left:2px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent);border-radius:0 8px 8px 0;background:var(--dsw-alias-bg-module-platform);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}

.dsf-rail{display:flex;flex:none;align-items:stretch;gap:3px;height:6px;margin:9px 12px 4px}
.dsf-seg{flex:1 1 0;min-width:3px;border-radius:999px;background:var(--dsw-alias-border-l2);overflow:hidden;position:relative}
.dsf-seg[data-state=done]{background:var(--dsw-alias-state-success-primary)}
.dsf-seg[data-state=error]{background:var(--dsw-alias-state-error-primary)}
.dsf-seg[data-state=running]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 35%,var(--dsw-alias-border-l2))}
.dsf-seg[data-state=running]::after{content:"";position:absolute;inset:0;border-radius:999px;background:linear-gradient(90deg,transparent 0%,var(--dsw-alias-state-business-primary) 50%,transparent 100%);animation:dsf-sweep 1.6s ease-in-out infinite}
.dsf-seg[data-state=future]{background:var(--dsw-alias-border-l1)}

.dsf-meta{display:flex;flex:none;align-items:center;gap:6px;min-width:0;padding:0 12px 8px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden}
.dsf-metaChip{flex:none;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
.dsf-metaChip[data-tone=done]{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 9%,transparent)}
.dsf-metaChip[data-tone=running]{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 9%,transparent)}
.dsf-metaChip[data-tone=failed]{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}

.dsf-body{display:flex;flex:1 1 auto;flex-direction:column;min-height:0;overflow-y:auto;overflow-x:hidden;padding:0 12px 12px;scrollbar-width:thin;scrollbar-gutter:stable;overscroll-behavior:contain}
.dsf-body::-webkit-scrollbar{width:8px}
.dsf-body::-webkit-scrollbar-track{background:transparent}
.dsf-body::-webkit-scrollbar-thumb{border-radius:999px;background:var(--dsw-alias-border-l2)}
.dsf-body::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-tertiary)}

.dsf-activity{display:flex;flex:none;flex-direction:column;gap:5px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.dsf-activity[data-kind=tool]{border-left-width:2px;border-left-color:var(--dsw-alias-state-business-primary)}
.dsf-activity[data-kind=waiting]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 46%,var(--dsw-alias-border-l2));background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 7%,var(--dsw-alias-bg-layer-1))}
.dsf-activityHead{display:flex;align-items:baseline;gap:6px;min-width:0}
.dsf-activityTitle{flex:none;font-size:11px;font-weight:600;line-height:16px;letter-spacing:.01em;color:var(--dsw-alias-label-secondary)}
.dsf-activity[data-kind=tool] .dsf-activityTitle{color:var(--dsw-alias-state-business-primary)}
.dsf-activity[data-kind=waiting] .dsf-activityTitle{color:var(--dsw-alias-state-warn-primary)}
.dsf-activityTool{min-width:0;font-family:var(--dsw-font-family-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsf-activityDetail{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:0;font-family:var(--dsw-font-family-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}
.dsf-activityText{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere}
.dsf-activityText[data-live=true]::after{content:"";display:inline-block;width:5px;height:11px;margin-left:2px;vertical-align:-1px;background:var(--dsw-alias-state-business-primary);animation:dsf-blink 1.1s ease-in-out infinite}
.dsf-sweep{flex:none;height:2px;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l1)}
.dsf-sweep::after{content:"";display:block;height:100%;width:40%;border-radius:999px;background:var(--dsw-alias-state-business-primary);animation:dsf-sweep 1.6s ease-in-out infinite}

.dsf-session{display:flex;flex-direction:column;flex:none;min-width:0}
.dsf-headingRow{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:8px;min-width:0;padding:8px 0 6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-caption);font-size:9.5px;font-weight:650;line-height:14px;letter-spacing:.07em;text-transform:uppercase}
.dsf-headingRow::after{content:"";flex:1 1 auto;height:1px;background:var(--dsw-alias-border-l1)}
.dsf-items{display:flex;flex-direction:column;gap:2px;flex:none;margin:0;padding:0;list-style:none}

.dsf-item{display:grid;align-items:start;border-radius:8px;min-width:0}

/* A prompt is a tinted block, never a step: it answers "which request does this
   work belong to", so it must be recognizable at a glance while scrolling. */
.dsf-promptItem{grid-template-columns:26px minmax(0,1fr);gap:7px;margin:10px 0 6px;padding:7px 9px 8px;border:0.5px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 30%,var(--dsw-alias-border-l2));background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 7%,var(--dsw-alias-bg-layer-1))}
.dsf-promptItem:first-child{margin-top:2px}
.dsf-promptIndex{display:grid;place-items:center;width:22px;height:22px;margin-top:1px;border-radius:999px;background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-foreground);font-size:11px;font-weight:650;line-height:1;font-variant-numeric:tabular-nums}
.dsf-promptHead{display:flex;align-items:baseline;gap:6px;min-width:0}
.dsf-promptTag{flex:none;font-size:9.5px;font-weight:650;line-height:14px;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-state-business-primary)}
.dsf-promptText{margin:1px 0 0;font-size:12px;line-height:17px;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.dsf-promptText{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}

.dsf-step{grid-template-columns:42px 16px minmax(0,1fr);gap:5px;padding:4px 0 4px 2px}
.dsf-step[data-live=true]{padding:5px 7px 5px 2px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 6%,transparent)}
.dsf-stepLabel{display:flex;flex-direction:column;gap:1px;flex:none;padding-top:2px;font-family:var(--dsw-font-family-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:10px;line-height:14px;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;white-space:nowrap}
.dsf-stepNumber{display:block;font-size:10px;line-height:14px}
.dsf-step[data-live=true] .dsf-stepLabel{color:var(--dsw-alias-state-business-primary)}
.dsf-stepIcon{display:grid;place-items:center;width:16px;height:18px;color:var(--dsw-alias-label-tertiary)}
.dsf-step[data-status=done] .dsf-stepIcon{color:var(--dsw-alias-state-success-primary)}
.dsf-step[data-status=error] .dsf-stepIcon{color:var(--dsw-alias-state-error-primary)}
.dsf-step[data-status=running] .dsf-stepIcon{color:var(--dsw-alias-state-business-primary)}
.dsf-stepIcon svg{display:block}
.dsf-stepSpinner{animation:dsf-spin 1s linear infinite}
.dsf-stepBody{display:flex;flex-direction:column;gap:1px;min-width:0}
.dsf-stepTitle{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:0;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dsf-step[data-live=true] .dsf-stepTitle,.dsf-step[data-status=error] .dsf-stepTitle{color:var(--dsw-alias-label-primary)}
.dsf-stepMeta{display:flex;align-items:baseline;gap:6px;min-width:0;font-size:10px;line-height:14px;color:var(--dsw-alias-label-caption);white-space:nowrap;overflow:hidden}
.dsf-stepTools{min-width:0;overflow:hidden;text-overflow:ellipsis;font-family:var(--dsw-font-family-mono,ui-monospace,SFMono-Regular,Menlo,monospace)}
.dsf-stepFiles{min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary)}
.dsf-stepFail{flex:none;color:var(--dsw-alias-state-error-primary)}
/* The step local start time, on its own line under the numbered row. */
.dsf-stepStamp{display:block;font-family:var(--dsw-font-family-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:8px;line-height:11px;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;white-space:nowrap;letter-spacing:-.01em}
.dsf-step[data-live=true] .dsf-stepStamp{color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 65%,var(--dsw-alias-label-caption))}
.dsf-omitted{flex:none;padding:2px 0 4px;font-size:10px;line-height:15px;color:var(--dsw-alias-label-caption)}

.dsf-errorCard{display:flex;flex:none;flex-direction:column;gap:3px;padding:8px 10px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 38%,var(--dsw-alias-border-l2));border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}
.dsf-errorTitle{font-size:11px;font-weight:600;line-height:16px;letter-spacing:.01em;color:var(--dsw-alias-state-error-primary)}
.dsf-errorText{margin:0;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}

.dsf-empty{display:flex;flex:1 1 auto;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:28px 18px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.dsf-emptyGlyph{color:var(--dsw-alias-label-tertiary);opacity:.7}
.dsf-emptyTitle{margin:0;font-size:12.5px;font-weight:600;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsf-emptyHint{margin:0;max-width:30ch;font-size:11.5px;line-height:17px}

.dsf-foot{display:flex;flex:none;align-items:center;gap:8px;padding:7px 12px;border-top:1px solid var(--dsw-alias-border-l1);font-size:10.5px;line-height:15px;color:var(--dsw-alias-label-caption);white-space:nowrap;overflow:hidden;font-variant-numeric:tabular-nums}
.dsf-footTurn{min-width:0;overflow:hidden;text-overflow:ellipsis}

@keyframes dsf-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent)}70%{box-shadow:0 0 0 5px transparent}100%{box-shadow:0 0 0 0 transparent}}
@keyframes dsf-blink{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes dsf-spin{to{transform:rotate(360deg)}}
@keyframes dsf-sweep{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}

@container (max-width: 300px){
  .dsf-elapsed{display:none}
  .dsf-turnTotal{display:none}
}

@media (prefers-reduced-motion: reduce){
  .dsf-statusDot,.dsf-stepSpinner,.dsf-seg[data-state=running]::after,.dsf-sweep::after,.dsf-activityText[data-live=true]::after{animation:none}
}

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