# ChatGPT MCP Workshop

ไฟล์ประกอบ Workshop ของ **Dev with Bebz** สำหรับทดลองเชื่อม ChatGPT บนเว็บเข้ากับ Local Workspace ผ่าน **MCP + OpenAI Secure Tunnel** และต่อยอดไปยัง **Google Stitch**

เป้าหมายของ repo นี้คือให้คนดูคลิปสามารถ clone แล้วทำตามได้โดยไม่ต้องใช้ path, Tunnel ID หรือ API Key ของเครื่องต้นฉบับ

## ภาพรวม

```text
ChatGPT (Web)
      |
      v
OpenAI Secure Tunnel
      |
      v
MCP Server
      |
      +--> Local Files
      |
      +--> Google Stitch
```

หลักสำคัญคือ **Tunnel กับ MCP Server เป็นคนละชิ้นกัน** หากต้องการเปลี่ยนความสามารถของ ChatGPT ก็เปลี่ยน MCP Server ที่อยู่หลัง Tunnel ได้ เช่น File System, Stitch, Serena หรือ MCP ตัวอื่น

## สิ่งที่มีใน repo

```text
.
├─ mcp-demo-files/
│  └─ hello.txt
├─ examples/
│  └─ chatgpt-mcp-workshop.example.yaml
├─ stitch-async-mcp/
│  ├─ artifact-server.mjs
│  ├─ server.mjs
│  ├─ worker.mjs
│  ├─ combo-server.mjs
│  ├─ package.json
│  └─ package-lock.json
├─ .gitignore
└─ README.md
```

> `tunnel-client.exe`, Runtime API Key, Stitch API Key และไฟล์ runtime ต่าง ๆ **ไม่ได้รวมอยู่ใน repo** และถูกกันออกด้วย `.gitignore`

## Prerequisites

- Windows 10/11
- Node.js + npm/npx
- ChatGPT ที่เปิด Developer Mode ได้
- OpenAI `tunnel-client`
- Google Stitch API Key เฉพาะส่วน Stitch

ตรวจสอบ Node.js:

```powershell
node --version
npm --version
npx --version
```

---

# Part 1 — ทดลอง MCP File System ในเครื่อง

## 1. รัน File System MCP

จาก root ของ repo:

```powershell
npx -y @modelcontextprotocol/server-filesystem ".\mcp-demo-files"
```

ถ้ารันสำเร็จจะเห็นข้อความประมาณว่า MCP File System Server กำลังทำงานผ่าน `stdio`

## 2. ตรวจด้วย MCP Inspector

หยุด server เดิมด้วย `Ctrl+C` แล้วรัน:

```powershell
npx -y @modelcontextprotocol/inspector npx -y @modelcontextprotocol/server-filesystem ".\mcp-demo-files"
```

จากหน้า Inspector ให้ Connect แล้วทดลอง tool เช่น `read_text_file` กับไฟล์:

```text
hello.txt
```

เมื่ออ่านไฟล์ได้ แปลว่า MCP Server ฝั่ง Local พร้อมใช้งานแล้ว

---

# Part 2 — เชื่อม ChatGPT ผ่าน OpenAI Secure Tunnel

## 1. สร้าง Tunnel และ Runtime API Key

สร้าง Tunnel จากหน้า OpenAI ที่ใช้กับ ChatGPT แล้วเก็บค่าเหล่านี้ไว้ในเครื่องของคุณ:

- `Tunnel ID`
- Runtime API Key ที่มีสิทธิ์เท่าที่จำเป็นสำหรับ Tunnel

> API Key คือ secret ห้าม commit ขึ้น Git และห้ามแชร์ใน screenshot/video หาก key นั้นยังใช้งานอยู่

## 2. ดาวน์โหลด tunnel-client

ดาวน์โหลด `tunnel-client.exe` จาก OpenAI แล้วเก็บไว้ในโฟลเดอร์ที่คุณต้องการ เช่น:

```text
chatgpt-mcp-workshop/
└─ tunnel-client/
   ├─ tunnel-client.exe
   ├─ runtime-api-key.txt
   └─ chatgpt-mcp-workshop.yaml
```

ไฟล์เหล่านี้เป็น local-only และ `.gitignore` จะไม่เอาขึ้น Git

## 3. สร้าง Tunnel Profile

ใช้ไฟล์ตัวอย่าง:

```text
examples/chatgpt-mcp-workshop.example.yaml
```

Copy ไปเป็นไฟล์จริงของคุณ แล้วแก้ placeholder ต่อไปนี้:

- `<YOUR_TUNNEL_ID>`
- `<ABSOLUTE_PATH_TO_RUNTIME_API_KEY>`
- `<ABSOLUTE_PATH_TO_WORKSPACE>`

ตรวจ profile:

```powershell
.\tunnel-client.exe doctor --profile-file .\chatgpt-mcp-workshop.yaml
```

รัน Tunnel:

```powershell
.\tunnel-client.exe run --profile-file .\chatgpt-mcp-workshop.yaml
```

เมื่อ Tunnel และ MCP Server พร้อมแล้ว จึงสร้าง/refresh Plugin ใน ChatGPT และทดลองให้ ChatGPT อ่าน `hello.txt`

---

# Part 3 — Google Stitch MCP

โฟลเดอร์ `stitch-async-mcp` มี MCP สำหรับเชื่อม Google Stitch และดึง artifact เช่น HTML / Screenshot ลง Local Workspace

## ติดตั้ง dependency

```powershell
cd .\stitch-async-mcp
npm ci
```

## ตั้ง Stitch API Key

### วิธีแนะนำ

ตั้ง Environment Variable:

```powershell
$env:STITCH_API_KEY="YOUR_STITCH_API_KEY"
```

หรือกำหนด path ของไฟล์ key:

```powershell
$env:STITCH_API_KEY_FILE="C:\path\to\stitch-api-key.txt"
```

### วิธีเดียวกับใน Workshop

หากไม่ได้กำหนด Environment Variable ตัว server ยังรองรับไฟล์แบบเดิม:

```text
../tunnel-client/stitch-api-key.txt
```

> วิธีเก็บเป็น text file ใช้เพื่อให้ Workshop ทำตามง่ายขึ้น หากใช้งานจริงควรใช้ Environment Variable หรือ Secret Store ที่เหมาะสม

## รัน Stitch Artifact MCP

```powershell
npm start
```

หรือ:

```powershell
node .\artifact-server.mjs
```

MCP ตัวนี้ expose tools หลัก:

- `stitch_list_projects`
- `stitch_list_screens`
- `stitch_pull_screen_artifacts`

`stitch_pull_screen_artifacts` จะค้น Project/Screen แล้วดาวน์โหลด artifact ที่รองรับลงโฟลเดอร์ภายใน workspace โดยไม่อนุญาตให้เขียนออกนอก root ของ repo

## Async Stitch MCP

สำหรับ flow ที่ต้องการ background job ภายใน MCP process:

```powershell
npm run start:async
```

ไฟล์สถานะ job จะถูกสร้างใน `stitch-async-mcp/jobs/` และถูก ignore จาก Git

## Combo MCP: Serena + Stitch

`combo-server.mjs` ใช้รวม tools จาก Serena และ Stitch ให้ expose ผ่าน MCP Server เดียว

ค่า Serena สามารถกำหนดผ่าน Environment Variable:

```powershell
$env:SERENA_EXE="C:\path\to\serena.exe"
$env:SERENA_CONTEXT="C:\path\to\your-serena-context.yml"
npm run start:combo
```

หาก `SERENA_EXE` ไม่ได้กำหนด ระบบจะลองเรียกคำสั่ง `serena` จาก `PATH`

---

# เปลี่ยน MCP Server หลัง Tunnel

จุดสำคัญของ Workshop คือ command ใน Tunnel Profile

ตัวอย่าง File System MCP:

```yaml
mcp:
  commands:
    - channel: main
      command: 'npx -y @modelcontextprotocol/server-filesystem "<ABSOLUTE_PATH_TO_WORKSPACE>/mcp-demo-files"'
```

เปลี่ยนเป็น Stitch:

```yaml
mcp:
  commands:
    - channel: main
      command: 'node "<ABSOLUTE_PATH_TO_WORKSPACE>/stitch-async-mcp/artifact-server.mjs"'
```

แนวคิดเดียวกันนี้ใช้กับ Serena, ComfyUI หรือ MCP Server อื่นได้

---

# Security Checklist

ก่อน push ขึ้น GitHub ให้เช็กอย่างน้อย:

```powershell
git status
git grep -n "sk-"
git grep -n "tunnel_"
```

และอย่า commit:

- Runtime API Key
- Stitch API Key
- `.env`
- `tunnel-client.exe`
- `node_modules`
- runtime jobs / generated output

หาก key เคยถูก commit ไปแล้ว การลบไฟล์ออกจาก commit ล่าสุดอย่างเดียวไม่พอ ควร revoke/rotate key นั้นด้วย

---

# Git Quick Start

```powershell
git init -b main
git add .
git status
git commit -m "Initial workshop release"
```

จากนั้นค่อยสร้าง repository บน GitHub และเพิ่ม remote ของคุณ

---

## Notes

Repo นี้ทำขึ้นเพื่อประกอบ Hands-on Workshop ของ **Dev with Bebz** โดยเน้นให้เข้าใจว่า ChatGPT, Tunnel และ MCP Server ทำหน้าที่คนละส่วน และสามารถสลับ/ต่อยอด backend ได้ตาม use case
