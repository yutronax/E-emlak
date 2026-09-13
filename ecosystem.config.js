module.exports = {
  apps : [{
    name: "e-emlak-admin-panel",
    script: "src/api/admin_panel.py",
    interpreter: "./.venv/bin/python3",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '700M',
    env: {
      PYTHONUNBUFFERED: "1"
    },
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    error_file: "logs/panel_error.log",
    out_file: "logs/panel_out.log",
    merge_logs: true
  },{
    name: "e-emlak-baileys-bridge",
    script: "sidecar/bridge.js",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '400M',
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    error_file: "logs/bridge_error.log",
    out_file: "logs/bridge_out.log",
    merge_logs: true
  }]
};
