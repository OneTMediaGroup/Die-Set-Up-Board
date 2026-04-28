export async function mountSystemTool(container) {
  container.innerHTML = `
    <div>
      <h2>System Controls</h2>
      <p class="muted">Reset, archive, security, and maintenance controls.</p>
    </div>

    <div class="card" style="margin-top:16px;">
      <strong>Current Controls</strong>
      <div class="muted" style="margin-top:8px;">
        Equipment archive/reset is currently available inside the Equipment tool.
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <strong>Next Controls</strong>
      <div class="muted" style="margin-top:8px;">
        Login/security, display mode controls, and cleanup tools will go here later.
      </div>
    </div>
  `;
  return () => {};
}
