import { BaseError, ResourceUnavailableRpcError, UserRejectedRequestError } from 'viem';
import { getErrorMessage } from '../../lib/api/error';

export interface ClassifiedAccountError {
  layer: 'session' | 'provider' | 'rpc';
  message: string;
  layerLabel: string;
}

export function classifyAccountError(cause: unknown): ClassifiedAccountError {
  const msg = getErrorMessage(cause);
  const isProvider =
    (cause instanceof BaseError &&
      (cause.walk(item => item instanceof UserRejectedRequestError) instanceof UserRejectedRequestError ||
       cause.walk(item => item instanceof ResourceUnavailableRpcError) instanceof ResourceUnavailableRpcError)) ||
    /User rejected|extension|wallet not found|wallet disconnected|Chưa đọc được kết nối ví|Từ chối ký/i.test(msg);

  const isRpc =
    /rpc|timeout|network error|connection timeout|chain mismatch|unsupported chain|transport|revert/i.test(msg);

  if (isProvider) {
    return {
      layer: 'provider',
      message: msg,
      layerLabel: 'Ví trình duyệt (Wallet Provider)',
    };
  }

  if (isRpc) {
    return {
      layer: 'rpc',
      message: msg,
      layerLabel: 'Mạng Blockchain / RPC (Network)',
    };
  }

  return {
    layer: 'session',
    message: msg,
    layerLabel: 'Phiên đăng nhập / API (Session)',
  };
}
