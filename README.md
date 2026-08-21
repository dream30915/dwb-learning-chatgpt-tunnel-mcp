# EP3 — ChatGPT + Stitch + Serena Web Workshop

เวิร์กช็อปนี้สาธิต workflow แบบ 2 Tunnel:

```text
Stitch -> Stitch Tunnel -> workspace/handoff/stitch -> Serena Tunnel -> Web Project
```

เป้าหมายคือให้ Stitch ทำหน้าที่ออกแบบ UI, Tunnel ดึง HTML/Screenshot ลงเครื่องอัตโนมัติ และให้ Serena รับช่วงประกอบ/แก้โค้ดใน `workspace` ต่อ

## Clone / Pull workshop branch

Clone ใหม่:

```powershell
git clone https://github.com/sphakanin/dwb-learning-chatgpt-tunnel-mcp.git
cd dwb-learning-chatgpt-tunnel-mcp
git switch ep3-stitch-serena-web
cd workshops\ep3-stitch-serena-web
```

ถ้ามี repo อยู่แล้ว:

```powershell
git fetch origin
git switch ep3-stitch-serena-web
git pull
cd workshops\ep3-stitch-serena-web
```

## Folder layout

```text
workshops/ep3-stitch-serena-web/
├─ stitch/
│  ├─ config/stitch-tunnel.yaml
│  ├─ secrets/*.example
│  ├─ src/server.mjs
│  ├─ package.json
│  └─ start-stitch-tunnel.ps1
├─ serena/
│  ├─ config/serena-tunnel.yaml
│  ├─ config/chatgpt.yml
│  ├─ secrets/*.example
│  └─ start-serena-tunnel.ps1
└─ workspace/
   └─ handoff/stitch/
```

## Prerequisites — ติดตั้งเองก่อนเริ่ม

1. **Windows 10/11** และ PowerShell
2. **Git** — ใช้ clone/pull workshop
3. **Node.js LTS + npm** — ใช้รัน Stitch wrapper
4. **ChatGPT account/workspace ที่เปิด Developer Mode / Custom MCP App ได้**
5. **OpenAI `tunnel-client.exe`** พร้อม Tunnel ID และ Runtime API Key สำหรับ Tunnel ที่จะสร้าง
6. **Google Stitch API Key**
7. **uv + Serena**

ตรวจ Git/Node:

```powershell
git --version
node --version
npm --version
```

ติดตั้ง Serena:

```powershell
uv tool install -p 3.13 serena-agent
serena init
serena --help
```

Official Serena: https://github.com/oraios/serena

OpenAI Developer Mode / MCP apps: https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta

> `tunnel-client.exe`, Runtime API Key และ Stitch API Key ไม่ถูกเก็บใน Git repository นี้

## Step 1 — เตรียม tunnel-client

สร้างโฟลเดอร์นี้แล้ววาง `tunnel-client.exe` ลงไปทั้งสองฝั่ง:

```text
stitch/tunnel-client/tunnel-client.exe
serena/tunnel-client/tunnel-client.exe
```

> สำหรับ workshop ตั้งใจให้วางแยกสองที่เพื่อให้ผู้เรียนเห็นชัดว่าเป็น 2 Tunnel คนละตัว

## Step 2 — ตั้งค่า Stitch Tunnel

Copy example secrets:

```powershell
Copy-Item .\stitch\secrets\stitch-api-key.example .\stitch\secrets\stitch-api-key.txt
Copy-Item .\stitch\secrets\runtime-api-key.example .\stitch\secrets\runtime-api-key.txt
```

ใส่ค่าจริงลง:

```text
stitch/secrets/stitch-api-key.txt
stitch/secrets/runtime-api-key.txt
```

จากนั้นเปิด:

```text
stitch/config/stitch-tunnel.yaml
```

แทนค่า:

```yaml
tunnel_id: "__TUNNEL_ID__"
```

ด้วย Tunnel ID ของ Stitch

Start:

```powershell
.\stitch\start-stitch-tunnel.ps1
```

ครั้งแรก script จะ `npm install` dependency ให้เอง

## Step 3 — ตั้งค่า Serena Tunnel

Copy Runtime Key:

```powershell
Copy-Item .\serena\secrets\runtime-api-key.example .\serena\secrets\runtime-api-key.txt
```

ใส่ Runtime API Key ลง:

```text
serena/secrets/runtime-api-key.txt
```

แล้วแทน `__TUNNEL_ID__` ใน:

```text
serena/config/serena-tunnel.yaml
```

Start:

```powershell
.\serena\start-serena-tunnel.ps1
```

Serena จะ activate `../workspace` เป็น project ให้อัตโนมัติ

## Step 4 — Workflow ใช้งานจริง

### ฝั่ง Stitch

1. สร้าง/แก้ Screen ใน Stitch
2. เรียกดู Screen ที่ต้องการส่งต่อ
3. Stitch Tunnel จะ pull ลง:

```text
workspace/handoff/stitch/<screen-name>-<id>/
├─ screen.html
├─ screenshot.png
└─ screen.json
```

### ฝั่ง Serena

ใน ChatGPT สั่งประมาณ:

```text
รับ Stitch handoff ล่าสุด แล้วประกอบเข้ากับเว็บใน workspace
```

Serena จะอ่าน handoff, localize assets, แก้/สร้างเว็บ, build และ test ต่อได้

## Ports

```text
Stitch Tunnel : 127.0.0.1:18030
Serena Tunnel : 127.0.0.1:18031
```

## Secret safety

ไฟล์จริงเหล่านี้ถูก `.gitignore` ไว้แล้ว:

```text
stitch/secrets/*.txt
serena/secrets/*.txt
stitch/tunnel-client/
serena/tunnel-client/
serena/serena-runtime/
```

อย่า commit API Key หรือ Runtime Key ขึ้น GitHub
