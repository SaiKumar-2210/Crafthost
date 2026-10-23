# Run CraftHost with Docker

CraftHost is split into a control plane and daemon nodes. The control plane serves the web UI and API. Each daemon node runs the worker that manages Minecraft containers on its Docker host.

## Control plane

Requirements: Docker Engine with the Compose plugin.

1. Copy `.env.docker.example` to `.env` and set strong random values for `MONGO_ROOT_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`, and `DAEMON_SECRET`. Use letters and numbers in the MongoDB username and password (they are embedded in a MongoDB URI). Keep the `.env` file private.
2. Start the control plane:

   ```sh
   docker compose -f compose.yaml up -d --build
   ```

3. Point a DNS name (for example `panel.example.com`) at the control instance's Elastic IP. Put a TLS reverse proxy such as Caddy in front of the panel; the app is bound to localhost port 3000 for this reason. A minimal Caddy site is:

   ```caddyfile
   panel.example.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```

   Then open `https://panel.example.com`. Daemon secrets and login tokens should travel over HTTPS.

MongoDB and Redis run in the same Compose project with persistent named volumes. AWS credentials are optional; without them, add daemon nodes manually. The legacy AWS provisioning integration requires AWS access and is not needed to host manually configured nodes.

### Idle shutdown

The scheduler stops a Minecraft server after ten continuous minutes with an empty RCON player list. Failed player-list queries reset the timer and never count as an empty server. The check runs once per minute.

Stopping daemon EC2 instances is opt-in. To enable it, set `AUTO_STOP_IDLE_EC2=true` and `AWS_INSTANCE_PROFILE_ENABLED=true` in the control-plane `.env`, attach an IAM role to the control-plane EC2 with `DescribeInstances`, `StartInstances`, and `StopInstances` permissions for the daemon instances, and set each daemon's unique `VM_NAME` and exact `VM_INSTANCE_ID` in `daemon.env`. Keep `DAEMON_SECRET` identical on all nodes. Since the control and scheduler run in containers, configure the control EC2's IMDSv2 response hop limit to at least `2` so the AWS SDK can retrieve role credentials from inside Docker. The scheduler stops an instance after five minutes with no running Minecraft processes and starts it when a server on that node is requested. Keep Elastic IPs associated with the instances if their player-facing addresses must remain stable. If the instance ID or IAM permissions are missing, the scheduler does not stop the instance.

## Daemon node (repeat per machine)

Each node needs a Linux host with Docker Engine, internet access to the control plane, a unique public IP, and firewall access for the daemon API plus the Minecraft ports you allocate. The daemon uses the host Docker socket to start one Minecraft container per game server. Access to that socket is equivalent to root access on the node; only run the daemon on machines you control.

1. Copy `daemon.env.example` to `daemon.env` on the node.
2. Set a unique `VM_NAME`, its matching region, `CONTROL_PLANE_URL` (public panel URL with no `/api` suffix), and the same `DAEMON_SECRET` used by the control plane. Optionally set the node public IP, server slot limit, and `DAEMON_DATA_PATH` (an absolute directory on the host; it defaults to `/opt/crafthost-data`).
3. From the project directory on the node, start it:

   ```sh
   docker compose --env-file daemon.env -f daemon.compose.yaml up -d --build
   ```

The daemon's server files, downloaded versions, and uploads live under `DAEMON_DATA_PATH` on the host and persist across container rebuilds. The directory is mounted at the same absolute path inside the daemon so the host Docker engine can mount server files into Minecraft containers. Open TCP 4000 from the control plane to the node. Open the Minecraft TCP ports assigned by CraftHost to players. Configure the machine firewall/security group to match; the daemon publishes each game port on the node automatically.

## Updating

Pull the new project files, then rerun the corresponding `docker compose ... up -d --build` command. Persistent database and server volumes are retained. `docker compose down -v` removes data volumes and should only be used when you intend to erase the stored data.

## Environment reference

Control plane `.env` values are documented in `.env.docker.example`. Daemon-specific values are documented in `daemon.env.example`. Keep `DAEMON_SECRET` identical on the control plane and every daemon node. `JWT_SECRET` must remain stable between restarts or existing tokens will stop validating.
