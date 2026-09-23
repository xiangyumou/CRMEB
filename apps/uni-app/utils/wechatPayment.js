// Keep the existing gateway payload and callbacks intact across mini-program APIs.
export function requestMiniProgramPayment(jsConfig, callbacks) {
  const method = uni.requestOrderPayment ? 'requestOrderPayment' : 'requestPayment';
  return uni[method]({
    timeStamp: jsConfig.timestamp,
    nonceStr: jsConfig.nonceStr,
    package: jsConfig.package,
    signType: jsConfig.signType,
    paySign: jsConfig.paySign,
    ...callbacks,
  });
}

export function requestWechatBrowserPayment(wechat, jsConfig) {
  return wechat.pay(jsConfig);
}

export function redirectExternalBrowserPayment(url) {
  setTimeout(() => { location.href = url; }, 1500);
}
