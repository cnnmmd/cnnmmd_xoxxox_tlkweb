class PrcAud extends AudioWorkletProcessor {

  constructor(option) {
    super(option);
    const { thdvol, mscend } = option.processorOptions || {};
    this.thdvol = thdvol;
    this.mscend = mscend;

    this.maxend = Math.ceil((sampleRate * (this.mscend / 1000)) / 128); // 無音の数：処理単位（指定時間分のサンプルレートから）
    this.cntend = 0; // 無音のカウンタ：処理単位
    this.flgspk = false; // 発声のフラグ
  }

  process (inputs) {
    const d = inputs[0][0];
    if (!d) return true;

    // 閾値を計算（RMS ）
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
    const rms = Math.sqrt(sum / d.length);
    //console.log('sts: rms: ', rms); // DBG

    if (rms > this.thdvol) {
      // 発声を検出
      if (!this.flgspk) {
        this.flgspk = true;
        this.port.postMessage({ evt: 'bgnSpk' });
      }
      this.cntend = 0;
    }
    else if (this.flgspk) {
      // 無音を検出
      this.cntend++;
      if (this.cntend >= this.maxend) {
        this.flgspk = false;
        this.cntend = 0;
        this.port.postMessage({ evt: 'endSpk' });
      }
    }

    return true;
  }
}

registerProcessor('prcaud', PrcAud);
