import { useEffect, useState } from 'react';
import { Field } from './field';
import { Button } from './button';

/** 11 digits starting with 1: what the server takes as a mainland mobile number. */
export const PHONE_PATTERN = /^1\d{10}$/;

export interface SmsCodeFieldProps {
  phone: string;
  onPhoneChange: (phone: string) => void;
  code: string;
  onCodeChange: (code: string) => void;
  /** Ask the server for a code; resolves with the seconds until another may be asked for. */
  onSend: () => Promise<number>;
  /** Leave out the phone row (a signed-in shopper's own number). */
  phoneReadOnly?: boolean | undefined;
  codeError?: string | undefined;
}

type Phase = { kind: 'idle' } | { kind: 'sending' } | { kind: 'countdown'; left: number };

/**
 * 手机号 + 验证码 (design.md §4.3): 「获取验证码」 checks the number first, then counts down
 * for as long as the server says (60 s usually). A failed send shows the server's reason.
 */
export function SmsCodeField({
  phone,
  onPhoneChange,
  code,
  onCodeChange,
  onSend,
  phoneReadOnly,
  codeError,
}: SmsCodeFieldProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const counting = phase.kind === 'countdown';

  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => {
      setPhase((current) =>
        current.kind === 'countdown' && current.left > 1
          ? { kind: 'countdown', left: current.left - 1 }
          : { kind: 'idle' },
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [counting]);

  async function send() {
    if (!PHONE_PATTERN.test(phone)) {
      setPhoneError('请输入正确的手机号');
      return;
    }
    setPhoneError(undefined);
    setPhase({ kind: 'sending' });
    try {
      const wait = await onSend();
      setPhase(wait > 0 ? { kind: 'countdown', left: wait } : { kind: 'idle' });
    } catch (error) {
      setPhase({ kind: 'idle' });
      setPhoneError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <>
      <Field
        label="手机号"
        type="tel"
        value={phone}
        onChange={(value) => {
          setPhoneError(undefined);
          onPhoneChange(value);
        }}
        placeholder="请输入手机号"
        readOnly={phoneReadOnly}
        error={phoneError}
      />
      <Field
        label="验证码"
        type="number"
        maxLength={6}
        value={code}
        onChange={onCodeChange}
        placeholder="请输入验证码"
        error={codeError}
        suffix={
          <Button
            variant="text"
            size="sm"
            disabled={counting}
            loading={phase.kind === 'sending'}
            onClick={() => void send()}
          >
            {phase.kind === 'countdown' ? `${phase.left} 秒后重发` : '获取验证码'}
          </Button>
        }
      />
    </>
  );
}
