import { trace, type Span, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("nudge", "0.1.0");

export function startSendSpan(attrs: Record<string, string | number>): Span {
  const span = tracer.startSpan("nudge.send", { attributes: attrs });
  return span;
}

export function recordSuccess(span: Span, attrs: Record<string, string | number>): void {
  span.setAttributes(attrs);
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

export function recordError(span: Span, error: Error): void {
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  span.recordException(error);
  span.end();
}
