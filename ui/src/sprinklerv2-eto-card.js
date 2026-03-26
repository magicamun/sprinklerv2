const isDev = import.meta.env?.DEV;
console.log("eto-card loaded")
class SprinklerEToCard extends HTMLElement {

  setConfig(config) {
    if (!config.entity) {
      throw new Error("ETo entity required");
    }

    this.config = config;
  }

  _getIcon(level) {
    switch (level) {
        case "high":
        return "mdi:water-alert";
        case "medium":
        return "mdi:water";
        default:
        return "mdi:water-off";
    }
  }

  set hass(hass) {
    this._hass = hass;

    const entityId = this.config.entity;
    const sensor = hass.states[entityId];

    if (!sensor) return;

    const eto = Number(sensor.state) || 0;
    const explanation = sensor.attributes.explanation || {};

    const label   = explanation.label || "–";
    const level   = explanation.level || "low";
    const factors = explanation.factors || [];
    const icon = this._getIcon(level);

    this.innerHTML = `
      <ha-card>
        ${this._styles()}

        <div class="card">

          <div class="header">
            <div class="title-row">
                <ha-icon icon="${icon}" class="eto-icon ${level}"></ha-icon>
                <div class="title">
                ${this.config.title || "ETo"}
                </div>
            </div>

            <div class="value">
              ${eto.toFixed(2)} mm
            </div>
          </div>

          <div class="label ${level}">
            ${label}
          </div>

          <div class="factors">
            ${factors.map(f => `<div class="factor">• ${f}</div>`).join("")}
          </div>

        </div>
      </ha-card>
    `;
  }

  _styles() {
    return `
      <style>
        .card {
          padding: 12px 14px;
        }

        .header {
          display:flex;
          justify-content:space-between;
          align-items:center;
          margin-bottom: 8px;
        }

        .title {
          font-size: 14px;
          opacity: 0.7;
        }

        .value {
          font-size: 16px;
          font-weight: 600;
        }

        .label {
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .label.low {
          color: #4CAF50;
        }

        .label.medium {
          color: #FB8C00;
        }

        .label.high {
          color: #E53935;
        }

        .factors {
          display:flex;
          flex-direction:column;
          gap: 2px;
          font-size: 13px;
          opacity: 0.75;
        }

        .factor {
          line-height: 1.4;
        }

        .title-row {
          display:flex;
          align-items:center;
          gap:6px;
        }

        .eto-icon {
          --mdc-icon-size: 18px;
          opacity: 0.85;
        }

        .eto-icon.low {
          color: #4CAF50;
        }

        .eto-icon.medium {
          color: #FB8C00;
        }

        .eto-icon.high {
          color: #E53935;
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
        0%   { transform: scale(1); }
        50%  { transform: scale(1.15); }
        100% { transform: scale(1); }
        }          
      </style>
    `;
  }

  getCardSize() {
    return 2;
  }
}

// ---------- Register ----------
const tagName = isDev
  ? "sprinklerv2-eto-card-dev"
  : "sprinklerv2-eto-card";

if (!customElements.get(tagName)) {
  customElements.define(tagName, SprinklerEToCard);
}