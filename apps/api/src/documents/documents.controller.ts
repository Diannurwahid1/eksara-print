import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { ApiError } from "../common/api-error";
import { CurrentUser } from "../common/decorators";
import { SessionGuard, type SessionUser } from "../common/session.guard";
import { DocumentsService } from "./documents.service";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
]);
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // handoff §2 step 2

export class CreateUploadIntentDto {
  @IsString() @MinLength(1) @MaxLength(255)
  fileName!: string;
  @IsString() @IsIn([...ALLOWED_MIME_TYPES])
  mimeType!: string;
  @IsInt() @Min(1) @Max(MAX_SIZE_BYTES)
  sizeBytes!: number;
}

@ApiTags("documents")
@Controller("documents")
export class DocumentsController {
  constructor(private documents: DocumentsService) {}

  @Post("upload-intents")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Create an upload intent and a short-lived presigned PUT URL" })
  async createIntent(@CurrentUser() user: SessionUser, @Body() dto: CreateUploadIntentDto) {
    if (!ALLOWED_MIME_TYPES.has(dto.mimeType)) {
      throw ApiError.badRequest("UNSUPPORTED_FILE_TYPE", "Unsupported file type");
    }
    if (dto.sizeBytes > MAX_SIZE_BYTES) {
      throw ApiError.badRequest("FILE_TOO_LARGE", "File exceeds the 50 MB limit");
    }
    return this.documents.createUploadIntent(user.id, dto);
  }

  @Put(":id/blob")
  @ApiOperation({ summary: "Upload target for the dev storage adapter (token-authorized PUT)" })
  async uploadBlob(
    @Param("id", ParseUUIDPipe) documentId: string,
    @Query("token") token: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const body = req.body;
    if (!token || !Buffer.isBuffer(body)) {
      throw ApiError.badRequest("UPLOAD_UNAUTHORIZED", "Missing upload token or body");
    }
    await this.documents.storeBlob(documentId, token, body);
    res.status(204).send();
  }

  @Post(":id/complete")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Validate the stored object and mark the document ready" })
  async complete(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) documentId: string) {
    return this.documents.completeUpload(user.id, documentId);
  }
}
