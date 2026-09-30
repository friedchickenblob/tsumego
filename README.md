# Tsumego

A 1v1 game of Go in the browser on a 9x9 board. Players queue in the lobby and are paired; colors are assigned randomly (Black moves first). Rules: captures, no suicide, simple ko, Japanese territory scoring (territory + prisoners), no komi. When both players pass in a row the game ends and territory is scored. Empty regions touching both colors, or neither, count for nobody. Blue squares mark Black's territory and red squares mark White's. There is no dead-stone marking or continue option yet.

## Architecture

```
GitHub Pages (static)            AWS (one EC2 t4g.nano)
client/  -- HTML/JS/canvas -->   Caddy :443 (auto TLS, <ip>.sslip.io)
                         wss://      -> Node + ws :8080  (server/)
```

- **Client** (`client/`): plain ES modules, no build step. It draws the board and sends `move`/`pass`.
- **Server** (`server/`): authoritative. `index.js` handles connections and the queue; `match.js` runs one game. Its only dependency is `ws`.
- **Shared** (`client/shared/`): `constants.js` and `go.js` (rules and scoring), imported by the server from `../client/shared`.
- Matchmaking keeps one queue per mode (`MODES` in `constants.js`).

## Run locally

```bash
cd server && npm install && npm start          # ws://localhost:8080
cd client && python3 -m http.server 5173       # open http://localhost:5173 in two tabs
```

On `localhost` the client connects to `ws://localhost:8080` automatically. On any page you can pick a server with `?server=wss://host`.

## Deploy

**Server (AWS):** requires the AWS CLI with credentials that have the permissions listed below.

```bash
AWS_REGION=us-east-1 deploy/deploy.sh     # creates the stack, writes the wss:// URL into client/config.js
```

The first boot takes about 2 minutes: installs, then the TLS certificate. After you push server changes, run `deploy/update-server.sh`. It uses SSM to pull and restart, so no SSH is needed. To tear everything down, run `aws cloudformation delete-stack --stack-name tank-duel`.

**Client (GitHub Pages):** in the repo, go to Settings → Pages → Source and choose **GitHub Actions**. Every push to `main` that touches `client/` then publishes it. The repo must be public, because the server clones it.

**Cost:** about $3/mo for the t4g.nano plus about $3.60/mo for its public IPv4 address. Pages is free.

### AWS permissions needed

- `cloudformation:*` on the `tank-duel` stack
- `ec2:RunInstances`, `TerminateInstances`, `Describe*`, `CreateSecurityGroup`, `DeleteSecurityGroup`, `AuthorizeSecurityGroupIngress`, `AllocateAddress`, `ReleaseAddress`, `AssociateAddress`, `DisassociateAddress`, `CreateTags`
- `iam:CreateRole`, `DeleteRole`, `AttachRolePolicy`, `DetachRolePolicy`, `CreateInstanceProfile`, `DeleteInstanceProfile`, `AddRoleToInstanceProfile`, `RemoveRoleFromInstanceProfile`, `PassRole`, `GetRole`
- `ssm:GetParameters` (to look up the AMI), `ssm:SendCommand`, `ssm:GetCommandInvocation`, `ssm:ListCommandInvocations`
