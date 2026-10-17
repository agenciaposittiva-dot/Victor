import { describe, expect, it } from 'vitest';
import { apagaDadosSemUso } from '@/dados/navegador';

const UA = {
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:125.0) Gecko/20100101 Firefox/125.0',
  edgeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.80',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1',
  ipadComoMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

describe('apagaDadosSemUso (WebKit com a regra dos 7 dias)', () => {
  it.each([
    ['Safari do Mac', UA.safariMac, 0, true],
    ['Chrome do Mac', UA.chromeMac, 0, false],
    ['Firefox do Mac', UA.firefoxMac, 0, false],
    ['Edge do Mac', UA.edgeMac, 0, false],
    ['Safari do iPhone', UA.safariIphone, 5, true],
    ['Chrome do iPhone (CriOS)', UA.chromeIphone, 5, true],
    ['iPad se apresentando como Macintosh com 5 toques', UA.ipadComoMac, 5, true],
    // só os toques decidem: o mesmo texto de "Mac com Chrome" é iPad (WebKit) com tela de toque e Mac sem ela
    ['UA de Mac com "Chrome" e 5 toques (iPad pedindo o site de computador)', UA.chromeMac, 5, true],
    ['UA de Mac com "Chrome" e 0 toques (Mac de verdade)', UA.chromeMac, 0, false],
    ['Chrome do Android', UA.chromeAndroid, 5, false],
    ['Chrome do Windows', UA.chromeWindows, 0, false],
  ])('%s', (_nome, ua, toques, esperado) => {
    expect(apagaDadosSemUso(ua, toques)).toBe(esperado);
  });
});
