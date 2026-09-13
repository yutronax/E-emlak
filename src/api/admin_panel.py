# -*- coding: utf-8 -*-
"""
admin_panel.py

E-emlak Mobil Yönetim Paneli (Flask Web App) - iskelet.

maviLojistik'teki admin panelinin çatısından (şifreli giriş, servis
durumu, log görüntüleme) devralınmıştır; lojistiğe özgü kara liste /
kasa eşleştirme uçları taşınmamıştır.

Çalıştırma: ./.venv/bin/python3 src/api/admin_panel.py
"""

import os

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, request, session, url_for

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("ADMIN_PANEL_SECRET_KEY", os.urandom(24))

ADMIN_PANEL_PASSWORD = os.environ.get("ADMIN_PANEL_PASSWORD")


def login_required(view):
    def wrapped(*args, **kwargs):
        if not session.get("authenticated"):
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    wrapped.__name__ = view.__name__
    return wrapped


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        if request.form.get("password") == ADMIN_PANEL_PASSWORD:
            session["authenticated"] = True
            return redirect(url_for("dashboard"))
        return "Hatalı şifre", 401
    return (
        "<form method='post'>"
        "<input type='password' name='password' placeholder='Şifre'>"
        "<button type='submit'>Giriş</button>"
        "</form>"
    )


@app.route("/")
@login_required
def dashboard():
    return jsonify({"status": "ok", "app": "e-emlak-admin-panel"})


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("ADMIN_PANEL_PORT", 5001)))
