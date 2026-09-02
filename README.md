# ChatGPT MCP Workshop

ไฟล์ประกอบ Workshop ของ **Woravej** สำหรับทดลองเชื่อม ChatGPT บนเว็บเข้ากับ Local Workspace ผ่าน **MCP + OpenAI Secure Tunnel** และต่อยอดไปยัง **Google Stitch**

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
      +--> Computer (workspace files + allowlisted commands)
      |
      +--> Google Stitch
```

หลักสำคัญคือ **Tunnel กับ MCP Server เป็นคนละชิ้นกัน** หากต้องการเปลี่ยนความสามารถของ ChatGPT ก็เปลี่ยน MCP Server ที่อยู่หลัง Tunnel ได้ เช่น File System, Stitch, Serena หรือ MCP ตัวอื่น

## สิ่งที่มีใน repo

```text
.
├─ mcp-demo-files/
│  └─ hello.txt
├─ computer-workspace/
│  └─ hello.txt
├─ computer-mcp/
│  ├─ server.mjs
│  ├─ lib/
│  ├─ test/
│  ├─ package.json
│  └─ package-lock.json
├─ examples/
│  └─ chatgpt-mcp-workshop.example.yaml
├─ scripts/
│  └─ setup-computer-mcp.ps1
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

## เข้าไปที่ root ของ repo ก่อนทุกคำสั่ง

PowerShell ต้องอยู่ที่โฟลเดอร์นี้ ไม่ใช่ `C:\Users\Woravejdump`:

```powershell
cd D:\Users\Woravejdump\Documents\GitHub\dwb-learning-chatgpt-tunnel-mcp
pwd
```

ต้องเห็น path ของ repo ไม่ใช่ home directory ถ้า `pwd` ยังเป็น `C:\Users\Woravejdump` คำสั่งถัดไปจะหา `mcp-demo-files` ไม่เจอ

---

# Part 1 — ทดลอง MCP File System ในเครื่อง

## 1. รัน File System MCP

จาก root ของ repo:

```powershell
cd D:\Users\Woravejdump\Documents\GitHub\dwb-learning-chatgpt-tunnel-mcp
npx -y @modelcontextprotocol/server-filesystem ".\mcp-demo-files"
```

ถ้ารันสำเร็จจะเห็นข้อความประมาณว่า MCP File System Server กำลังทำงานผ่าน `stdio`

## 2. ตรวจด้วย MCP Inspector

หยุด server เดิมด้วย `Ctrl+C` แล้วรัน:

```powershell
cd D:\Users\Woravejdump\Documents\GitHub\dwb-learning-chatgpt-tunnel-mcp
npx -y @modelcontextprotocol/inspector npx -y @modelcontextprotocol/server-filesystem ".\mcp-demo-files"
```

จากหน้า Inspector ให้ Connect แล้วทดลอง tool เช่น `read_text_file` กับไฟล์:

```text
hello.txt
```

เมื่ออ่านไฟล์ได้ แปลว่า MCP Server ฝั่ง Local พร้อมใช้งานแล้ว

> Inspector token ใน URL (`MCP_INSPECTOR_API_TOKEN=...`) เป็น session secret ของเครื่อง ห้ามแปะใน screenshot / คลิป / แชท

## Troubleshooting — โฟลเดอร์ผิด

ถ้าเห็นข้อความประมาณนี้:

```text
Warning: Cannot access directory C:\Users\Woravejdump\mcp-demo-files, skipping
Error: None of the specified directories are accessible
```

แปลว่า PowerShell ไม่ได้อยู่ที่ root ของ repo `.\mcp-demo-files` เป็น path สัมพัทธ์ จึงชี้ไปที่ `C:\Users\Woravejdump\mcp-demo-files` ซึ่งไม่มีอยู่

โฟลเดอร์จริงอยู่ที่:

```text
D:\Users\Woravejdump\Documents\GitHub\dwb-learning-chatgpt-tunnel-mcp\mcp-demo-files
```

แก้โดย `cd` ไปที่ repo แล้วตรวจด้วย `pwd` จากนั้นรันคำสั่งใหม่:

```powershell
cd D:\Users\Woravejdump\Documents\GitHub\dwb-learning-chatgpt-tunnel-mcp
pwd
```

ถ้า Inspector เปิดอยู่แล้วจากโฟลเดอร์ผิด ให้ `Ctrl+C` แล้วรันคำสั่ง Inspector ใหม่จาก repo

---

# Part 2 — เชื่อม ChatGPT ผ่าน OpenAI Secure Tunnel

ค่าเริ่มต้นของ Workshop นี้คือ **Computer MCP** (`computer-mcp/server.mjs`) ไม่ใช่ File System MCP ChatGPT จะอ่าน/เขียนไฟล์ใน `computer-workspace` และรันคำสั่ง read-only ที่กำหนด ID ไว้เท่านั้น **ไม่มี freeform PowerShell ในโหมดมาตรฐาน**

จัด path และติดตั้ง dependency บนเครื่องนี้ก่อน:

```powershell
cd D:\Users\Woravejdump\Documents\GitHub\dwb-learning-chatgpt-tunnel-mcp
.\scripts\setup-computer-mcp.ps1
```

ถ้า PowerShell บล็อกสคริปต์ ให้รันแบบนี้แทน:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-computer-mcp.ps1
```

สคริปต์จะ `npm ci` ใน `computer-mcp/` แล้วเขียนไฟล์ local (ถูก ignore จาก Git):

```text
tunnel-client/
├─ chatgpt-mcp-workshop.yaml
└─ runtime-api-key.txt
```

Profile ที่ถูกเขียนแล้วชี้ Computer MCP และเติม path ของ repo นี้ให้แล้ว ยังเหลือ 3 อย่างที่ต้องทำเอง เพราะต้องมาจากบัญชี OpenAI ของคุณ:

1. สร้าง Tunnel จากหน้า OpenAI ที่ใช้กับ ChatGPT แล้ว copy `Tunnel ID`
2. วาง Runtime API Key ลง `tunnel-client/runtime-api-key.txt` (ใส่เฉพาะ key ไม่มี quote)
3. วาง Tunnel ID ลง `tunnel-client/chatgpt-mcp-workshop.yaml` แทน `<YOUR_TUNNEL_ID>` แล้วรัน tunnel-client

> API Key คือ secret ห้าม commit ขึ้น Git และห้ามแชร์ใน screenshot/video หาก key นั้นยังใช้งานอยู่

## วาง tunnel-client จากบัญชี OpenAI ของคุณ

สคริปต์จะไม่ดาวน์โหลด `tunnel-client.exe` ให้ ไฟล์นี้ต้องมาจากหน้า OpenAI ของบัญชีคุณ แล้วนำมาวางในโฟลเดอร์นี้:

```text
tunnel-client/
├─ tunnel-client.exe
├─ runtime-api-key.txt
└─ chatgpt-mcp-workshop.yaml
```

ไฟล์เหล่านี้เป็น local-only และ `.gitignore` จะไม่เอาขึ้น Git

## ตรวจแล้วรัน Tunnel

จากโฟลเดอร์ `tunnel-client/`:

```powershell
cd D:\Users\Woravejdump\Documents\GitHub\dwb-learning-chatgpt-tunnel-mcp
powershell -ExecutionPolicy Bypass -File .\scripts\sanitize-runtime-api-key.ps1
cd .\tunnel-client
.\tunnel-client.exe doctor --profile-file .\chatgpt-mcp-workshop.yaml
.\tunnel-client.exe run --profile-file .\chatgpt-mcp-workshop.yaml
```

ถ้า `doctor` ขึ้น `control plane API key is malformed` ให้รันสคริปต์ sanitize ก่อน คีย์ต้องอยู่บรรทัดเดียว ไม่มี newline ท้ายไฟล์

เมื่อ `run` ขึ้นแล้ว UI ท้องถิ่นอยู่ที่ http://127.0.0.1:18020/ui จากนั้นไป ChatGPT Settings > Connectors > Tunnel เลือก tunnel เดียวกัน แล้ว refresh plugin

Command หลักใน profile คือ:

```yaml
mcp:
  commands:
    - channel: main
      command: 'node "<ABSOLUTE_PATH_TO_WORKSPACE>/computer-mcp/server.mjs"'
```

เมื่อ Tunnel และ MCP Server พร้อมแล้ว จึงสร้าง/refresh Plugin ใน ChatGPT แล้วทดลองให้ ChatGPT อ่าน `hello.txt` ใน `computer-workspace` หรือเรียก `run_allowed_command` ด้วย `command_id` เป็น `get_date`

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

# Part 4 — ให้ ChatGPT คุมเครื่องในโฟลเดอร์ที่กำหนด

File System MCP ใน Part 1 อ่าน/เขียนไฟล์ใน `mcp-demo-files` ได้เท่านั้น **ไม่ได้คุมทั้งเครื่อง** Computer MCP เป็นค่าเริ่มต้นตอนเชื่อม ChatGPT ใน Part 2

`computer-mcp` ให้ ChatGPT:

- ดูสถานะเครื่องและโฟลเดอร์ที่อนุญาต
- อ่าน/เขียนไฟล์ใน `computer-workspace` (กัน `..`, absolute path และ junction/symlink ที่ชี้นอกโฟลเดอร์)
- รันคำสั่ง read-only ที่กำหนด ID ไว้ (`get_date`, `os_info`) ผ่าน `run_allowed_command`

โหมดมาตรฐาน **ไม่รับสตริง PowerShell อิสระ** เครื่องมือ `run_powershell` ถูกถอดออกแล้ว ถ้าต้องการ shell ทั้งเครื่องต้องตั้ง `COMPUTER_MCP_ALLOW_UNRESTRICTED_SHELL=1` บน process ที่รัน `tunnel-client` จากนั้นจะมี tool ชื่อ `run_powershell_unsafe` MCP annotation หรือข้อความยืนยันจากโมเดล **ไม่ใช่** การควบคุมฝั่งเซิร์ฟเวอร์

อย่าชี้ `COMPUTER_MCP_ROOT` ไปที่ `C:\` หรือโฟลเดอร์ระบบ อย่าใส่ unrestricted-shell env ลงใน YAML ที่ generate จากสคริปต์ setup

## ติดตั้งบนเครื่องนี้

จาก root ของ repo:

```powershell
cd D:\Users\Woravejdump\Documents\GitHub\dwb-learning-chatgpt-tunnel-mcp
.\scripts\setup-computer-mcp.ps1
```

หรือติดตั้งเอง:

```powershell
cd D:\Users\Woravejdump\Documents\GitHub\dwb-learning-chatgpt-tunnel-mcp\computer-mcp
npm ci
```

## รัน Computer MCP

```powershell
cd D:\Users\Woravejdump\Documents\GitHub\dwb-learning-chatgpt-tunnel-mcp\computer-mcp
npm start
```

หรือ:

```powershell
node .\server.mjs
```

Tools หลัก (โหมดมาตรฐาน):

- `computer_status`
- `list_workspace`
- `read_text_file`
- `write_text_file`
- `run_allowed_command` (`command_id`: `get_date` หรือ `os_info`)

`run_powershell_unsafe` มีเฉพาะเมื่อตั้ง:

```powershell
$env:COMPUTER_MCP_ALLOW_UNRESTRICTED_SHELL="1"
```

บน process ที่ start MCP หรือ tunnel-client ค่าอื่นที่ไม่ใช่ `1` ยังคงปิด shell

ทดลองใน Inspector จาก root ของ repo:

```powershell
cd D:\Users\Woravejdump\Documents\GitHub\dwb-learning-chatgpt-tunnel-mcp
npx -y @modelcontextprotocol/inspector node .\computer-mcp\server.mjs
```

จากนั้น Connect แล้วลอง `read_text_file` กับ `hello.txt` หรือ `run_allowed_command` ด้วย `get_date`

ตรวจ regression:

```powershell
cd D:\Users\Woravejdump\Documents\GitHub\dwb-learning-chatgpt-tunnel-mcp\computer-mcp
npm test
```

ถ้า Inspector เปิดอยู่แล้วจากโฟลเดอร์ผิด ให้ `Ctrl+C` แล้วรันใหม่จาก repo

> Inspector token ใน URL เป็น session secret ของเครื่อง ห้ามแปะใน screenshot / คลิป / แชท

## ต่อเข้า ChatGPT ผ่าน Tunnel

Computer MCP เป็น command หลักอยู่แล้วหลังรัน `.\scripts\setup-computer-mcp.ps1` คุณยังต้องสร้าง Tunnel เอง แล้วทำ 3 ข้อนี้:

1. สร้าง Tunnel จากหน้า OpenAI / ChatGPT Developer Mode แล้ว copy Tunnel ID
2. วาง Runtime API Key ลง `tunnel-client/runtime-api-key.txt`
3. วาง Tunnel ID ลง `tunnel-client/chatgpt-mcp-workshop.yaml` แทน `<YOUR_TUNNEL_ID>` จากนั้นรัน `tunnel-client.exe`

Command ใน profile:

```yaml
mcp:
  commands:
    - channel: main
      command: 'node "<ABSOLUTE_PATH_TO_WORKSPACE>/computer-mcp/server.mjs"'
```

จากนั้น refresh Plugin ใน ChatGPT แล้วทดลองให้มัน:

- อ่าน `hello.txt` ใน `computer-workspace`
- สร้างไฟล์ใหม่ในโฟลเดอร์นั้น
- เรียก `run_allowed_command` ด้วย `get_date`

อย่ารัน unrestricted shell ใน workshop ปกติ หากต้องเปิดชั่วคราว ให้ตั้ง env บนหน้าต่างที่รัน `tunnel-client.exe` แล้ว **restart tunnel-client** (MCP process ใหม่จะโหลด tool ชุดใหม่) ไม่พอแค่ refresh plugin

```powershell
$env:COMPUTER_MCP_ALLOW_UNRESTRICTED_SHELL="1"
```

ความเสี่ยงที่ยังเหลือเมื่อเปิด unsafe mode: คำสั่งรันด้วยสิทธิ์ Windows user เดียวกัน, สืบทอด `process.env` ทั้งก้อน, และ denylist เป็นชั้นเสริมเท่านั้น ไม่ใช่ security boundary Timeout จะ `taskkill /T /F` process tree แต่ผลข้างเคียงที่เขียนลงดิสก์ไปแล้วจะไม่ถูกย้อนกลับ

ขยายโฟลเดอร์ที่อนุญาตได้ด้วย Environment Variable (ยังคงเป็นโฟลเดอร์ที่คุณเลือกเอง ไม่ใช่ทั้งดิสก์):

```powershell
$env:COMPUTER_MCP_ROOT="D:\Users\Woravejdump\Documents\GitHub\dwb-learning-chatgpt-tunnel-mcp\computer-workspace"
```

---

# เปลี่ยน MCP Server หลัง Tunnel

จุดสำคัญของ Workshop คือ command ใน Tunnel Profile ค่าเริ่มต้นคือ Computer MCP

```yaml
mcp:
  commands:
    - channel: main
      command: 'node "<ABSOLUTE_PATH_TO_WORKSPACE>/computer-mcp/server.mjs"'
```

เปลี่ยนเป็น File System MCP:

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
cd .\computer-mcp
npm test
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

Repo นี้ทำขึ้นเพื่อประกอบ Hands-on Workshop ของ **Woravej** โดยเน้นให้เข้าใจว่า ChatGPT, Tunnel และ MCP Server ทำหน้าที่คนละส่วน และสามารถสลับ/ต่อยอด backend ได้ตาม use case
