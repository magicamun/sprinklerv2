console.log("Module Utils loaded");

export function isAdmin(hass) {
  return hass?.user?.is_admin === true;
}

export function openConfirmDialog({
  title,
  text,
  entityName = null,
  confirmText = "OK",
  danger = false,
  onConfirm
}) {
  const dialog = document.createElement("ha-dialog");
  document.body.appendChild(dialog);
  console.log("entity:")
  console.log(entityName);
    dialog.innerHTML = `
    <style>
        .sp-dialog {
        padding: 18px 20px 16px;
        min-width: 280px;
        text-align: center;
        }

        .sp-dialog-title {
        font-size: 17px;
        font-weight: 600;
        margin-bottom: 10px;
        }

        .sp-dialog-body {
        font-size: 14px;
        opacity: 0.7;
        margin-bottom: 6px;
        }

        .sp-dialog-entity {
        font-size: 15px;
        font-weight: 600;
        margin-bottom: 18px;
        }

        .sp-dialog-actions {
        display: flex;
        justify-content: center;
        gap: 10px;
        }

        .sp-btn {
        padding: 8px 16px;
        border-radius: 10px;
        cursor: pointer;
        font-weight: 500;
        border: 1px solid var(--divider-color);
        background: var(--card-background-color);
        min-width: 100px;
        text-align: center;
        }

        .sp-btn.primary {
        background: var(--primary-color);
        color: white;
        border: none;
        }

        .sp-btn.danger {
        background: #e53935;
        color: white;
        border: none;
        }

        .sp-btn:active {
        opacity: 0.85;
        }
    </style>

    <div class="sp-dialog">
        <div class="sp-dialog-title">
        🗑️ ${title}
        </div>
        <div class="sp-dialog-body">
        ${text}
        </div>

        ${entityName ? `
        <div class="sp-dialog-entity">
            ${entityName}
        </div>
        ` : ""}

        <div class="sp-dialog-actions">
        <div id="cancelBtn" class="sp-btn">Abbrechen</div>
        <div id="confirmBtn" class="sp-btn ${danger ? "danger" : "primary"}">
            ${confirmText}
        </div>
        </div>
    </div>
    `;

  setTimeout(() => dialog.open = true, 0);

    const cancelBtn = dialog.querySelector("#cancelBtn");
    const confirmBtn = dialog.querySelector("#confirmBtn");

    confirmBtn.onclick = () => {

      dialog.open = false;   // 👈 WICHTIG (nicht nur close())

      setTimeout(() => dialog.remove(), 150);

      onConfirm?.();
    };
    cancelBtn.onclick = () => dialog.close();

    cancelBtn.onclick = () => {
      dialog.open = false;
    };

  dialog.addEventListener("closed", () => dialog.remove());
}