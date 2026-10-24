import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { CurrentUser } from "../common/decorators";
import { SessionGuard, type SessionUser } from "../common/session.guard";
import { OrdersService } from "./orders.service";

export class PrintOptionsDto {
  @IsIn(["A4", "A3", "Letter"]) paperSize!: "A4" | "A3" | "Letter";
  @IsIn(["bw", "color"]) color!: "bw" | "color";
  @IsInt() @Min(1) @Max(99) copies!: number;
  @IsIn(["single", "double"]) sides!: "single" | "double";
  @IsIn(["none", "staple", "bind"]) finishing!: "none" | "staple" | "bind";
}

export class CreatePrintOrderDto {
  @IsString() @MinLength(1)
  documentId!: string;
  @ValidateNested() @Type(() => PrintOptionsDto)
  options!: PrintOptionsDto;
  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
  @IsOptional() @IsInt() @Min(1) @Max(168)
  expiresInHours?: number;
}

@ApiTags("print-orders")
@Controller("print-orders")
@UseGuards(SessionGuard)
export class OrdersController {
  constructor(private orders: OrdersService) {}

  @Post()
  @ApiOperation({ summary: "Create a draft order and one share grant; PIN is shown once" })
  async create(@CurrentUser() user: SessionUser, @Body() dto: CreatePrintOrderDto) {
    return this.orders.createOrder(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "List the current customer's orders (never includes the PIN)" })
  async listMine(@CurrentUser() user: SessionUser, @Query("scope") scope: string | undefined) {
    void scope; // only 'mine' is supported today; other scopes are rejected server-side
    return this.orders.listMine(user.id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Owned order detail and receipt summary (never includes the PIN)" })
  async get(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.orders.getOrder(user.id, id);
  }
}
