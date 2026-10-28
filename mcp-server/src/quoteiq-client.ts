import type { Config } from './config.ts';

const REQUEST_TIMEOUT_MS = 30_000;

/** An error the API returned, worded for the assistant (and so the user) to act on. */
export class QuoteIqApiError extends Error {}

export interface PlaybookAnswer {
  answer: string;
  grounded: boolean;
  citations: { sourceNumber: number; documentTitle: string; excerpt: string }[];
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  title: string;
  status: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string | null;
  createdAt: string;
  client: { name: string };
  createdBy: { name: string };
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
}

/** What the tools need from QuoteIQ; the tests use a fake. */
export interface QuoteIqApi {
  askPlaybook(question: string): Promise<PlaybookAnswer>;
  findQuotation(reference: string): Promise<Quotation | null>;
}

// Everything except publicToken: it is the secret behind the quotation's public link
const QUOTATION_FIELDS = `
  id quotationNumber title status subtotal taxRate taxAmount total notes createdAt
  client { name }
  createdBy { name }
  items { description quantity unitPrice lineTotal }
`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GraphQlResponse<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
}

/**
 * The QuoteIQ GraphQL API, called as the configured user: with their token, or by logging in
 * with their email and password. The API enforces what that user may see (a sales rep only
 * their own quotations) and charges playbook answers to their AI quota.
 */
export class QuoteIqClient implements QuoteIqApi {
  private readonly config: Config;
  private readonly fetchFn: typeof fetch;
  private token: string | undefined;

  constructor(config: Config, fetchFn: typeof fetch = fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
    this.token = config.QUOTEIQ_TOKEN;
  }

  async askPlaybook(question: string): Promise<PlaybookAnswer> {
    const data = await this.request<{ askPlaybook: PlaybookAnswer }>(
      `mutation AskPlaybook($question: String!) {
        askPlaybook(question: $question) {
          answer grounded citations { sourceNumber documentTitle excerpt }
        }
      }`,
      { question },
    );
    return data.askPlaybook;
  }

  /** By id, or by quotation number (e.g. QT-2026-0042); null if not found or not visible. */
  async findQuotation(reference: string): Promise<Quotation | null> {
    if (UUID.test(reference)) {
      const data = await this.request<{ quotation: Quotation | null }>(
        `query Quotation($id: ID!) { quotation(id: $id) { ${QUOTATION_FIELDS} } }`,
        { id: reference },
      );
      return data.quotation;
    }
    // The search also matches titles and client names: keep only the exact number
    const data = await this.request<{ quotations: Quotation[] }>(
      `query FindQuotation($search: String!) {
        quotations(filter: { search: $search }, take: 10) { ${QUOTATION_FIELDS} }
      }`,
      { search: reference },
    );
    return (
      data.quotations.find(
        (q) => q.quotationNumber.toLowerCase() === reference.toLowerCase(),
      ) ?? null
    );
  }

  private async request<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    let body = await this.post<T>(query, variables, await this.accessToken());
    // An expired session: with a password we can sign in again, once
    if (isUnauthenticated(body) && this.config.QUOTEIQ_EMAIL) {
      this.token = undefined;
      body = await this.post<T>(query, variables, await this.accessToken());
    }
    if (isUnauthenticated(body)) {
      throw new QuoteIqApiError(
        'QuoteIQ rejected the credentials: the token may have expired. Update QUOTEIQ_TOKEN, or set QUOTEIQ_EMAIL and QUOTEIQ_PASSWORD.',
      );
    }
    const error = body.errors?.[0];
    if (error) throw new QuoteIqApiError(error.message);
    if (!body.data) throw new QuoteIqApiError('QuoteIQ returned no data.');
    return body.data;
  }

  private async accessToken(): Promise<string> {
    if (this.token) return this.token;
    const res = await this.send(
      `mutation Login($email: String!, $password: String!) {
        login(email: $email, password: $password) { id }
      }`,
      {
        email: this.config.QUOTEIQ_EMAIL,
        password: this.config.QUOTEIQ_PASSWORD,
      },
    );
    const body = (await res.json()) as GraphQlResponse<unknown>;
    // The API sets the token as an HttpOnly cookie; it also accepts it as a Bearer header
    const token = res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0] ?? '')
      .find((c) => c.startsWith('access_token='))
      ?.slice('access_token='.length);
    if (body.errors?.length || !token) {
      throw new QuoteIqApiError(
        `QuoteIQ login failed for ${this.config.QUOTEIQ_EMAIL}: ${body.errors?.[0]?.message ?? 'no session returned'}`,
      );
    }
    this.token = token;
    return token;
  }

  private async post<T>(
    query: string,
    variables: Record<string, unknown>,
    token: string,
  ): Promise<GraphQlResponse<T>> {
    const res = await this.send(query, variables, token);
    try {
      return (await res.json()) as GraphQlResponse<T>;
    } catch {
      throw new QuoteIqApiError(
        `QuoteIQ answered HTTP ${res.status} without a GraphQL response.`,
      );
    }
  }

  private async send(
    query: string,
    variables: Record<string, unknown>,
    token?: string,
  ): Promise<Response> {
    try {
      return await this.fetchFn(this.config.QUOTEIQ_API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new QuoteIqApiError(
        `Could not reach QuoteIQ at ${this.config.QUOTEIQ_API_URL}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

function isUnauthenticated(body: GraphQlResponse<unknown>): boolean {
  return (
    body.errors?.some((e) => e.extensions?.code === 'UNAUTHENTICATED') ?? false
  );
}
