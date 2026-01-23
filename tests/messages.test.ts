// tests/messages.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../src/middleware/errorHandler';
import { ErrorCodes } from '../src/constants/errorCodes';

import {
  encodeCursor,
  decodeCursor,
  fetchMessages,
  ensureConversationExists,
  createMessage,
  validateDocumentOwnership,
  linkAttachments,
} from '../src/modules/messages/messages.service';

import { createScriptedSupabaseClient } from './utils/scriptedSupabaseMock';

// ✅ Audit side-effect'lerini kapat
vi.mock('../src/services/auditLogService', () => ({
  auditLogService: {
    logAsync: vi.fn(),
  },
}));

const CLIENT_ID = '11111111-1111-4111-a111-111111111111';
const ACTOR_USER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const CONVERSATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const MESSAGE_ID_1 = 'dddddddd-dddd-4ddd-9ddd-dddddddddddd';
const MESSAGE_ID_2 = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee';

const DOC_ID_1 = '99999999-9999-4999-8999-999999999999';
const DOC_ID_2 = '88888888-8888-4888-8888-888888888888';

describe('messages.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cursor helpers', () => {
    it('encode/decode roundtrip works', () => {
      const createdAt = '2026-01-01T10:00:00.000Z';
      const id = MESSAGE_ID_1;

      const cursor = encodeCursor(createdAt, id);
      const decoded = decodeCursor(cursor);

      expect(decoded.created_at).toBe(createdAt);
      expect(decoded.id).toBe(id);
    });

    it('decodeCursor throws AppError(422) on invalid cursor', () => {
      try {
        decodeCursor('not-a-valid-base64');
        throw new Error('should not reach');
      } catch (e: any) {
        expect(e).toBeInstanceOf(AppError);
        expect(e.statusCode).toBe(422);
      }
    });

    it('decodeCursor throws AppError(422) on invalid uuid/timestamp payload', () => {
      const bad = Buffer.from('not-a-date|not-a-uuid').toString('base64');

      try {
        decodeCursor(bad);
        throw new Error('should not reach');
      } catch (e: any) {
        expect(e).toBeInstanceOf(AppError);
        expect(e.statusCode).toBe(422);
      }
    });
  });

  describe('fetchMessages', () => {
    it('returns messages with attachments + next_cursor when full page', async () => {
      const script = {
        messages: [
          {
            data: [
              {
                id: MESSAGE_ID_1,
                client_id: CLIENT_ID,
                conversation_id: CONVERSATION_ID,
                sender_user_id: ACTOR_USER_ID,
                sender_role: 'client',
                body: 'hello 1',
                created_at: '2026-01-02T10:00:00.000Z',
              },
              {
                id: MESSAGE_ID_2,
                client_id: CLIENT_ID,
                conversation_id: CONVERSATION_ID,
                sender_user_id: ACTOR_USER_ID,
                sender_role: 'client',
                body: 'hello 2',
                created_at: '2026-01-01T10:00:00.000Z',
              },
            ],
            error: null,
          },
        ],
        message_attachments: [
          {
            data: [
              {
                message_id: MESSAGE_ID_1,
                document_id: DOC_ID_1,
                documents: {
                  name: 'doc1.pdf',
                  mime_type: 'application/pdf',
                  size_bytes: 123,
                },
              },
              {
                message_id: MESSAGE_ID_1,
                document_id: DOC_ID_2,
                documents: {
                  name: 'doc2.png',
                  mime_type: 'image/png',
                  size_bytes: 456,
                },
              },
            ],
            error: null,
          },
        ],
      };

      const supabase = createScriptedSupabaseClient(script as any) as any;

      const res = await fetchMessages(supabase, CLIENT_ID, 2);

      expect(res.items).toHaveLength(2);
      expect(res.items[0].id).toBe(MESSAGE_ID_1);
      expect(res.items[0].attachments).toHaveLength(2);
      expect(res.items[0].attachments[0]).toMatchObject({
        document_id: DOC_ID_1,
        filename: 'doc1.pdf',
        mime_type: 'application/pdf',
        size_bytes: 123,
      });

      // full page => next_cursor should exist
      expect(res.next_cursor).toBeTruthy();

      // cursor should decode to last item (MESSAGE_ID_2)
      const decoded = decodeCursor(res.next_cursor!);
      expect(decoded.id).toBe(MESSAGE_ID_2);
      expect(decoded.created_at).toBe('2026-01-01T10:00:00.000Z');
    });

    it('returns next_cursor null when not full page', async () => {
      const script = {
        messages: [
          {
            data: [
              {
                id: MESSAGE_ID_1,
                client_id: CLIENT_ID,
                conversation_id: CONVERSATION_ID,
                sender_user_id: ACTOR_USER_ID,
                sender_role: 'client',
                body: 'hello 1',
                created_at: '2026-01-02T10:00:00.000Z',
              },
            ],
            error: null,
          },
        ],
        message_attachments: [
          { data: [], error: null },
        ],
      };

      const supabase = createScriptedSupabaseClient(script as any) as any;

      const res = await fetchMessages(supabase, CLIENT_ID, 2);
      expect(res.items).toHaveLength(1);
      expect(res.next_cursor).toBeNull();
    });

    it('throws AppError(500) on supabase error', async () => {
      const script = {
        messages: [
          { data: null, error: { message: 'db down' } },
        ],
      };

      const supabase = createScriptedSupabaseClient(script as any) as any;

      await expect(fetchMessages(supabase, CLIENT_ID, 10)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('ensureConversationExists', () => {
    it('returns existing conversation if present', async () => {
      const script = {
        client_conversations: [
          { data: { id: CONVERSATION_ID }, error: null }, // maybeSingle()
        ],
      };

      const supabase = createScriptedSupabaseClient(script as any) as any;

      const res = await ensureConversationExists(supabase, CLIENT_ID, ACTOR_USER_ID, 'client');
      expect(res).toEqual({ conversationId: CONVERSATION_ID, isNew: false });
    });

    it('creates conversation if missing', async () => {
      const script = {
        client_conversations: [
          { data: null, error: null },                 // maybeSingle() => none
          { data: { id: CONVERSATION_ID }, error: null } // insert().select().single()
        ],
      };

      const supabase = createScriptedSupabaseClient(script as any) as any;

      const res = await ensureConversationExists(supabase, CLIENT_ID, ACTOR_USER_ID, 'client');
      expect(res).toEqual({ conversationId: CONVERSATION_ID, isNew: true });
    });

    it('handles unique-violation race (23505) by reselecting', async () => {
      const script = {
        client_conversations: [
          { data: null, error: null }, // maybeSingle() => none
          { data: null, error: { code: '23505', message: 'duplicate key' } }, // insert fails
          { data: { id: CONVERSATION_ID }, error: null }, // reselect single()
        ],
      };

      const supabase = createScriptedSupabaseClient(script as any) as any;

      const res = await ensureConversationExists(supabase, CLIENT_ID, ACTOR_USER_ID, 'client');
      expect(res).toEqual({ conversationId: CONVERSATION_ID, isNew: false });
    });
  });

  describe('createMessage', () => {
    it('creates message and best-effort updates conversation', async () => {
      const script = {
        messages: [
          {
            data: {
              id: MESSAGE_ID_1,
              client_id: CLIENT_ID,
              conversation_id: CONVERSATION_ID,
              sender_user_id: ACTOR_USER_ID,
              sender_role: 'client',
              body: 'hello',
              created_at: '2026-01-03T10:00:00.000Z',
            },
            error: null,
          },
        ],
        client_conversations: [
          { data: [], error: null }, // update()
        ],
      };

      const supabase = createScriptedSupabaseClient(script as any) as any;

      const msg = await createMessage(
        supabase,
        CLIENT_ID,
        CONVERSATION_ID,
        ACTOR_USER_ID,
        'client',
        'hello'
      );

      expect(msg.id).toBe(MESSAGE_ID_1);
      expect(msg.body).toBe('hello');
    });

    it('throws AppError(500) if insert fails', async () => {
      const script = {
        messages: [
          { data: null, error: { message: 'insert failed' } },
        ],
      };

      const supabase = createScriptedSupabaseClient(script as any) as any;

      await expect(
        createMessage(supabase, CLIENT_ID, CONVERSATION_ID, ACTOR_USER_ID, 'client', 'hello')
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('validateDocumentOwnership', () => {
    it('passes when all docs exist and belong to client', async () => {
      const script = {
        documents: [
          {
            data: [
              { id: DOC_ID_1, client_id: CLIENT_ID },
              { id: DOC_ID_2, client_id: CLIENT_ID },
            ],
            error: null,
          },
        ],
      };

      const supabase = createScriptedSupabaseClient(script as any) as any;

      await expect(
        validateDocumentOwnership(supabase, CLIENT_ID, [DOC_ID_1, DOC_ID_2])
      ).resolves.toBeUndefined();
    });

    it('throws 403 if any doc missing (count mismatch)', async () => {
      const script = {
        documents: [
          {
            data: [{ id: DOC_ID_1, client_id: CLIENT_ID }],
            error: null,
          },
        ],
      };

      const supabase = createScriptedSupabaseClient(script as any) as any;

      await expect(
        validateDocumentOwnership(supabase, CLIENT_ID, [DOC_ID_1, DOC_ID_2])
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('throws 403 if any doc belongs to different client', async () => {
      const script = {
        documents: [
          {
            data: [
              { id: DOC_ID_1, client_id: CLIENT_ID },
              { id: DOC_ID_2, client_id: '22222222-2222-4222-8222-222222222222' },
            ],
            error: null,
          },
        ],
      };

      const supabase = createScriptedSupabaseClient(script as any) as any;

      await expect(
        validateDocumentOwnership(supabase, CLIENT_ID, [DOC_ID_1, DOC_ID_2])
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('linkAttachments', () => {
    it('inserts attachments successfully', async () => {
      const script = {
        message_attachments: [
          { data: [], error: null },
        ],
      };

      const supabase = createScriptedSupabaseClient(script as any) as any;

      const result = await linkAttachments(supabase, MESSAGE_ID_1, CLIENT_ID, [DOC_ID_1, DOC_ID_2]);
      expect(result).toEqual({ inserted: 2 });
    });

    it('throws 422 on duplicate attachment (23505)', async () => {
      const script = {
        message_attachments: [
          { data: null, error: { code: '23505', message: 'duplicate key' } },
        ],
      };

      const supabase = createScriptedSupabaseClient(script as any) as any;

      await expect(
        linkAttachments(supabase, MESSAGE_ID_1, CLIENT_ID, [DOC_ID_1])
      ).rejects.toMatchObject({
        statusCode: 422,
      });
    });

    it('throws 500 on generic insert error', async () => {
      const script = {
        message_attachments: [
          { data: null, error: { code: 'XX', message: 'insert error' } },
        ],
      };

      const supabase = createScriptedSupabaseClient(script as any) as any;

      await expect(
        linkAttachments(supabase, MESSAGE_ID_1, CLIENT_ID, [DOC_ID_1])
      ).rejects.toBeInstanceOf(AppError);
    });
  });
});
