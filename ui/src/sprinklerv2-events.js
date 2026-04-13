console.log("EVENT MODULE LOADED");

const UI_TEXT = {
    // ---- Zone ----
    ZONE_STARTED:         ({ entity_id, duration }) => `Zone ${entity_id} gestartet für ${Math.round(duration / 60)} Minuten`,
    ZONE_CANCELLED:       ({ entity_id })           => `Zone ${entity_id} abgebrochen`,
    ZONE_EXTENDED:        ({ entity_id, duration }) => `Zone ${entity_id} verlängert um ${Math.round(duration / 60)} Minuten`,
    ZONE_UPDATED:         ({ entity_id })           => `Zone ${entity_id} aktualisiert`,
    ZONE_DELETED:         ({ entity_id })           => `Zone ${entity_id} gelöscht`,
    ZONE_FINISHED:        ({ entity_id })           => `Zone ${entity_id} beendet`,
    ZONE_ADDED:           ({ entity_id })           => `Zone ${entity_id} angelegt`,

    ZONE_RUNNING:         ({ entity_id })           => `Zone ${entity_id} läuft`,
    ZONE_QUEUED:          ({ entity_id })           => `Zone ${entity_id} wartet`,
    ZONE_IN_PROGRAM:      ({ entity_id })           => `Zone ${entity_id} ist Teile eines Programms`,
    ZONE_INVALID_PAYLOAD: ({ })                     => `Ungültige, Keine Payload für Service`,
    ZONE_NOT_FOUND:       ({ entity_id })           => `Zone ${entity_id} nicht gefunden`,
    ZONE_NOT_RUNNING:     ({ entity_id })           => `Zone ${entity_id} läuft nicht`,
    ZONE_NOT_QUEUED:      ({ entity_id })           => `Zone ${entity_id} nicht eingereiht`,
    ZONE_NOT_CANCELLED:   ({ entity_id })           => `Zone ${entity_id} nicht abgebrochen`,
    ZONE_NOT_UPDATED:     ({ entity_id })           => `Zone ${entity_id} nicht geändert`,    

    ZONE_IDLE:            ({ entity_id })           => `Zone ${entity_id} ist Inaktiv`,
    ZONE_IGNORED:         ({ entity_id })           => `Zone ${entity_id} ignoriert`,
    ZONE_NOT_ADDED:       ({ entity_id })           => `Zone ${entity_id} nicht hinzugefügt`,
    ZONE_ACTIVE:          ({ entity_id })           => `Zone ${entity_id} aktiv`,

    ZONE_SOIL_RESET:      ({ entity_id })           => `Soil Reset for Zone ${entity_id}`,

    // ---- Program ----
    PROGRAM_STARTED:      ({ entity_id })           => `Programm ${entity_id} gestartet`,
    PROGRAM_CANCELLED:    ({ entity_id })           => `Programm ${entity_id} abgebrochen`,
    PROGRAM_COMPLETED:    ({ entity_id })           => `Programm ${entity_id} beendet`,

    PROGRAM_CONFLICT:     ({ })                     => `Programmkonflikt`,
    PROGRAM_NOT_FOUND:    ({ entity_id })           => `Programm ${entity_id} nicht gefunden`,
    PROGRAM_NOT_ADDED:    ({ entity_id })           => `Programm ${entity_id} nicht hinzugefügt`,
    PROGRAM_NOT_UPDATED:  ({ entity_id })           => `Programm ${entity_id} nicht geändert`,
    PROGRAM_NOT_DELETED:  ({ entity_id })           => `Programm ${entity_id} nicht gelöscht`,

    PROGRAM_ADDED:        ({ entity_id })           => `Programm ${entity_id} hinzugefügt`, 
    PROGRAM_UPDATED:      ({ entity_id })           => `Programm ${entity_id} geändert`,
    PROGRAM_DELETED:      ({ entity_id })           => `Programm ${entity_id} gelöscht`,

    PROGRAM_NOT_STARTED:  ({ entity_id })           => `Programm ${entity_id} nicht gestartet`,
    PROGRAM_NOT_RUNNING:  ({ entity_id })           => `Programm ${entity_id} läuft nicht`,
    PROGRAM_NOT_STOPPED:  ({ entity_id })           => `Programm ${entity_id} nicht gestoppt`,
    PROGRAM_STOPPED:      ({ entity_id })           => `Programm ${entity_id} gestoppt`,
    PROGRAM_NOT_SKIPPED:  ({ entity_id })           => `Programm ${entity_id} n. Lauf nicht übersprungen`,
    PROGRAM_SKIPPED:      ({ entity_id })           => `Programm ${entity_id} n. Lauf übersprungen`,

    // ---- Scheduler ----
    SCHEDULER_STARTED:    ({ })                    => `Scheduler gestartet`,
    SCHEDULER_STOPPED:    ({ })                    => `Scheduler gestoppt`,
    SCHEDULER_ERROR:      ({ })                    => `Scheduler - Fehler`,
    
    // ---- User ----
    USER_NOT_ADMIN:       ({ entity_id })          => `User ${entity_id} hat keine Berechtuigung`,

    // ---- Internal ----
    INTERNAL_ERROR:       ({ })                    => `Ìnterner Fehler`,
    INTERNAL_PROGRAMS_CHANGED: ({ })               => `Programme Geändert`
}

function showSnackbar(message, status = "info") {

  const ha = document.querySelector("home-assistant");
  if (!ha) return;

  ha.dispatchEvent(
    new CustomEvent("hass-notification", {
      bubbles: true,
      composed: true,
      detail: {
        message,
        ...(status === "error" ? { type: "error" } : {})
      }
    })
  );
}

let listenerRegistered = false;
let feedbackRegistered = false;

export function registerSprinklerFeedback(hass) {

    if (!hass || listenerRegistered)
        return;

    listenerRegistered = true;
    feedbackRegistered = true;

    hass.connection.subscribeEvents(event => {

      if (event.event_type !== "sprinkler_ui_feedback")
        return;

      const data = event.data;

      const handler = UI_TEXT[data.code];
      if (!handler) return;

      const payload = {
        ...data,
        ...(data.data || {})
      };

      const message = handler(payload);

      showSnackbar(message, data.status);

    }, "sprinkler_ui_feedback");
}

function _generateRequestId() {
    // Moderne Browser
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    // Fallback
    return "req-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

export function callServiceWithRequest(card, service, payload = {}, {
    closeDialog = true
} = {}) {

    const requestId = _generateRequestId()

    card._lastRequestId = requestId;

    // 🔥 sicherstellen dass Map existiert
    if (!card._pendingRequests) {
        card._pendingRequests = new Map();
    }

    // 🔥 Timeout
    const timeout = setTimeout(() => {

        card._pendingRequests.delete(requestId);

        card._handleRequestTimeout?.(requestId);

    }, 5000);

    // 🔥 speichern (NEU!)
    card._pendingRequests.set(requestId, { timeout });

    // 🔥 Service Call
    card._hass.callService("pyscript", service, {
        ...payload,
        request_id: requestId
    });

    if (closeDialog) {
        card._closeActiveDialog?.();
    }

    return requestId;
}