import { Logger, Module } from "@nestjs/common";
import { SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

/**
 * /v1/events WebSocket for `order.updated`, `station.job.available`, and
 * `station.device.revoked` (handoff §4).
 *
 * SCAFFOLD: connections are accepted but not authenticated and nothing is
 * emitted yet. TODO(production): authenticate sockets (session cookie or
 * station credential), scope rooms per customer/shop/station, and emit from
 * the order/release services via a transactional outbox.
 */
@WebSocketGateway({ path: "/v1/events", cors: { origin: (process.env.WEB_ORIGIN ?? "").split(","), credentials: true } })
export class EventsGateway {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  @SubscribeMessage("subscribe")
  subscribe(client: Socket, payload: unknown): { ok: boolean } {
    // TODO(production): validate the topic against the caller's identity.
    this.logger.debug(`subscribe from ${client.id}: ${JSON.stringify(payload)}`);
    return { ok: true };
  }
}

@Module({
  providers: [EventsGateway],
})
export class EventsModule {}
