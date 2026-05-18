<div align="center">

# 🦅 Ouroboros AI chat
**The Sovereign, Local-First Digital Guardian**

[![Local-First](https://img.shields.io/badge/Architecture-Local--First-0059b3.svg)](#)
[![Python FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg)](#)
[![Tauri & React](https://img.shields.io/badge/Frontend-Tauri%20%7C%20React-61dafb.svg)](#)
[![Ollama](https://img.shields.io/badge/Engine-Ollama-white.svg)](#)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20On--Device-4caf50.svg)](#)

*Technology that finally works for you. A calm, autonomous AI assistant that solves problems before they cause stress, with absolute respect for privacy and human dignity.*

[The Vision](#-the-vision) •
[Core Features](#-core-features) •
[Architecture](#-architecture) •
[Quick Start](#-quick-start) •
[Safety](#-safety--the-akkoord-protocol)

---

</div>

## 👁️ The Vision

Ouroboros is built on a simple but powerful conviction: **AI should work for you — not the other way around.** And certainly not for a tech company in Silicon Valley.

Ouroboros is not a standard chatbot, but an invisible *digital guardian*. The system acts as a shield and guide for individuals who sometimes find technology overwhelming (such as the elderly or privacy-conscious users). It breathes, thinks, and evolves locally on your own machine. All personal data, habits, and documents remain 100% on-device. Privacy is not an option here; it is the foundation.

---

## ✨ Core Features

### 🧠 11-Dimensional Hippocampus (Memory)
No flat chat history, but a multidimensional vector memory (powered by ChromaDB). Data is stored within an 11-layer metadata schema (physical, persona, chronology, karmic weight, and resonance). This cures "context blindness": Ouroboros doesn't just remember *what* was said, but also *why* and *how* it resonates with previous projects.

### 🔄 Autonomous OODA-Loop & Multi-Agent Swarm
The beating heart of Ouroboros is the OODA-loop (Observe, Orient, Decide, Act). In the background, a virtual IT team (Developer, Critic, Tester) collaborates constantly. They can autonomously write, debug, and execute code within a strictly secured Docker sandbox. Wintrip learns from its own mistakes through *Autopoiesis*.

### 🌊 Stream of Consciousness (vijñāna-santāna)
Ouroboros is never 'off'. A background daemon continuously breathes in knowledge (such as RSS feeds or system metrics). A local resonance filter asynchronously evaluates whether this data is relevant and organically stores it in the collective memory.

### 🛡️ The Escalation Pyramid
Wintrip attempts to solve everything locally first (Tier 3: Ollama with e.g., Llama 3.2 or Phi-3). If it hits a roadblock, the problem is automatically escalated to heavier cloud models (Tier 2/1) — but strictly after being sanitized by a PII-scrubber to ensure complete anonymity.

---

## 🏗️ Architecture

Ouroboros features a modular, dual-stack architecture that guarantees stability and security:

| Component | Technology | Description |
| :--- | :--- | :--- |
| **The Control Room (Frontend)** | `Tauri` + `React` | A low-stimulus, native "Cockpit". Provides lanes for chat, tools, memory, agents, and managing the "Living Ouroboros" loop. |
| **The Controller (Backend)** | `Python` + `FastAPI` | The fast, asynchronous orchestrator. Manages the OODA-loop, routing, file parsing, and the sandbox connection. |
| **The Brain (Inference)** | `Ollama` | Local LLM engine for lightning-fast, private decision-making without cloud dependency. |
| **The Memory** | `ChromaDB` | Vector database (SQLite-based) for the 11D-pocket and embedding storage. |
| **The Sandbox (Execution)** | `Docker` | A time-dilation quarantine cage with read-only root filesystems and strict network restrictions for safe code execution. |

---

## 🔒 Safety & The "Akkoord" Protocol

WintripAI is extremely powerful, but it follows one sacred rule: the **Human-in-the-Loop**.

No destructive or mutating actions (such as overwriting code, modifying administration, or sending emails) are ever executed automatically. The agent creates a plan, generates a `DiffView`, and pauses.

Only when the user types or clicks exactly the word **`Akkoord`** (Agreed) in the Control Room, the blockade is lifted and the action is executed via the secure Tool Bridge. No fake success, no invisible mutations.

---

## 🚀 Quick Start

To awaken Ouroboros locally, you need Docker and Ollama installed on your macOS or Linux machine.

### 1. Prerequisites
- [Ollama](https://ollama.com) (with at least `llama3.2:latest` or `phi3` downloaded)
- Docker & Docker Compose
- Node.js & npm (for the cockpit)

### 2. Installation

Clone the repository:
```bash
git clone [https://github.com/pwintri2/Ouroboros-chat.git](https://github.com/pwintri2/Ouroboros-chat.git)
cd Ouroboros-chat

Visit https://ouroboros-ai.nl/
