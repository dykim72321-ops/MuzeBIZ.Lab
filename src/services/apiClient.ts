/**
 * apiClient.ts — Resilient HTTP Client
 *
 * 모든 네트워크 요청의 공통 관문(Single Gateway).
 * 기능:
 *   1. Exponential Backoff 기반 재시도 (maxRetries, retryableStatuses)
 *   2. 요청 Timeout (AbortController 기반)
 *   3. 중복 요청 자동 취소 (deduplication key)
 *   4. 타입 안전한 JSON 파싱
 *
 * 사용 예:
 *   import { apiClient } from './apiClient';
 *   const data = await apiClient.get<BrokerAccountResponse>('/api/broker/account');
 */

// ─── Configuration ───────────────────────────────────────────────────────────

const PY_API_BASE = import.meta.env.DEV
  ? '/py-api'
  : (import.meta.env.VITE_API_BASE_URL ?? '/py-api');

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const BASE_RETRY_DELAY_MS = 500;

// ─── In-flight Request Deduplication ─────────────────────────────────────────

/** 동일 endpoint에 대한 동시 요청을 추적하여 이전 요청을 자동 취소 */
const inflightControllers = new Map<string, AbortController>();

function getOrCreateController(dedupeKey: string | null): AbortController {
  if (dedupeKey && inflightControllers.has(dedupeKey)) {
    // 이전 요청 취소
    inflightControllers.get(dedupeKey)!.abort();
  }
  const controller = new AbortController();
  if (dedupeKey) {
    inflightControllers.set(dedupeKey, controller);
  }
  return controller;
}

function cleanupController(dedupeKey: string | null) {
  if (dedupeKey) {
    inflightControllers.delete(dedupeKey);
  }
}

// ─── Core Fetch with Retry ───────────────────────────────────────────────────

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** 기존 요청 자동 취소를 위한 고유 키. 동일 키의 새 요청이 오면 이전을 abort. null이면 dedup 안 함 */
  dedupeKey?: string | null;
  /** 요청 타임아웃 (ms) */
  timeout?: number;
  /** 최대 재시도 횟수 */
  maxRetries?: number;
  /** 추가 헤더 */
  headers?: Record<string, string>;
  /** 외부에서 주입하는 AbortSignal (React Query 등) */
  signal?: AbortSignal;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly detail?: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.detail = detail;
  }
}

async function resilientFetch<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    dedupeKey = null,
    timeout = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    headers: extraHeaders = {},
    signal: externalSignal,
  } = options;

  let lastError: Error | null = null;
  const url = `${PY_API_BASE}${endpoint}`;

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // 매 시도마다 새로운 Controller 발급 (이전 attempt의 abort 상태 격리)
      const controller = getOrCreateController(dedupeKey);

      // 외부 signal 이벤트 등록
      const onExternalAbort = () => controller.abort();
      if (externalSignal) {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }

      // 타임아웃 설정
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        signal: controller.signal,
      };

      if (body && (method === 'POST' || method === 'PUT')) {
        fetchOptions.body = JSON.stringify(body);
      }

      try {
        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
          const err = new ApiClientError(
            errorData.detail || `HTTP Error: ${response.status}`,
            response.status,
            errorData.detail,
          );

          if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxRetries) {
            lastError = err;
            const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
            console.warn(
              `[ApiClient] ${method} ${endpoint} → ${response.status}. Retrying in ${delay}ms (${attempt + 1}/${maxRetries})`,
            );
            await sleep(delay);
            continue;
          }

          throw err;
        }

        return (await response.json()) as T;
      } catch (error: unknown) {
        // AbortError(타임아웃 포함) 발생 시에도 재시도를 탈 수 있게 함
        if (error instanceof DOMException && error.name === 'AbortError') {
          lastError = new ApiClientError('Request aborted (timeout or cancelled)', 0, 'ABORT');
          // 외부 Signal 취소라면 재시도 없이 즉시 에러
          if (externalSignal?.aborted) {
            throw lastError;
          }
        } else if (error instanceof ApiClientError) {
          throw error;
        }

        // 네트워크 에러 등 → 재시도
        lastError = error as Error;
        if (attempt < maxRetries) {
          const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
          console.warn(
            `[ApiClient] ${method} ${endpoint} → Network error. Retrying in ${delay}ms (${attempt + 1}/${maxRetries})`,
          );
          await sleep(delay);
          continue;
        }
      } finally {
        // 성공·실패·재시도 모든 경로에서 타이머와 외부 리스너 정리
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener('abort', onExternalAbort);
      }
    }

    throw lastError || new Error(`[ApiClient] ${method} ${endpoint} failed after ${maxRetries} retries`);
  } finally {
    cleanupController(dedupeKey);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public API ──────────────────────────────────────────────────────────────

function getAdminHeaders(): Record<string, string> {
  const adminKey = import.meta.env.VITE_ADMIN_SECRET_KEY;
  return adminKey ? { 'X-Admin-Key': adminKey } : {};
}

export const apiClient = {
  /**
   * 공개 API 호출 (인증 불필요)
   */
  get<T>(endpoint: string, opts?: Omit<FetchOptions, 'method'>): Promise<T> {
    return resilientFetch<T>(endpoint, { ...opts, method: 'GET' });
  },
  post<T>(endpoint: string, body?: unknown, opts?: Omit<FetchOptions, 'method' | 'body'>): Promise<T> {
    return resilientFetch<T>(endpoint, { ...opts, method: 'POST', body });
  },
  put<T>(endpoint: string, body?: unknown, opts?: Omit<FetchOptions, 'method' | 'body'>): Promise<T> {
    return resilientFetch<T>(endpoint, { ...opts, method: 'PUT', body });
  },
  delete<T>(endpoint: string, opts?: Omit<FetchOptions, 'method'>): Promise<T> {
    return resilientFetch<T>(endpoint, { ...opts, method: 'DELETE' });
  },

  /**
   * 관리자 인증 API 호출 (X-Admin-Key 헤더 자동 추가)
   */
  broker: {
    get<T>(endpoint: string, opts?: Omit<FetchOptions, 'method'>): Promise<T> {
      return resilientFetch<T>(endpoint, { ...opts, method: 'GET', headers: { ...getAdminHeaders(), ...opts?.headers } });
    },
    post<T>(endpoint: string, body?: unknown, opts?: Omit<FetchOptions, 'method' | 'body'>): Promise<T> {
      return resilientFetch<T>(endpoint, { ...opts, method: 'POST', body, headers: { ...getAdminHeaders(), ...opts?.headers } });
    },
    put<T>(endpoint: string, body?: unknown, opts?: Omit<FetchOptions, 'method' | 'body'>): Promise<T> {
      return resilientFetch<T>(endpoint, { ...opts, method: 'PUT', body, headers: { ...getAdminHeaders(), ...opts?.headers } });
    },
    delete<T>(endpoint: string, opts?: Omit<FetchOptions, 'method'>): Promise<T> {
      return resilientFetch<T>(endpoint, { ...opts, method: 'DELETE', headers: { ...getAdminHeaders(), ...opts?.headers } });
    },
  },

  /**
   * 진행 중인 모든 요청 취소 (페이지 언마운트 시 활용)
   */
  cancelAll(): void {
    for (const controller of inflightControllers.values()) {
      controller.abort();
    }
    inflightControllers.clear();
  },
};
