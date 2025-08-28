//--------------------------------------------------------------------------
// 音声：録音（音量を検知）：複数スレッド

export const SndVce = class {

  constructor(adrgen, thdvol, mscend, urlaud) {
    this.adrgen = adrgen;
    this.thdvol = thdvol; // 発声の有無の閾値
    this.mscend = mscend; // 発声の終了を判定する時間（ミリセカンド）
    this.urlaud = urlaud; // ワークレット（音声）

    this.unicnk = 1000; // 録音チャンクの単位（ミリセカンド）
    this.maxcnk = 1; // 発声までの無音の時間を、どれくらい保持するか（録音チャンクの数で）
  }

  iniAud = async () => {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.ctxaud = new AudioContext();
    this.devrec = new MediaRecorder(this.stream);
    // ワークレットを取得〜設定
    await this.ctxaud.audioWorklet.addModule(this.urlaud);
    this.prcaud = new AudioWorkletNode(this.ctxaud, 'prcaud', {
      processorOptions: {
        thdvol: this.thdvol, 
        mscend: this.mscend
      }
    });
    const source = this.ctxaud.createMediaStreamSource(this.stream);
    source.connect(this.prcaud);
  }

  recVce = async () => {
    let bufpre = []; // 事前の録音
    let bufsnd = []; // 本体の録音
    let cnkhed = null; // 音声のヘッダ用（最初のチャンク）
    let flgrec = false;
  
    // 録音を開始
    this.devrec.start(this.unicnk);  
  
    // チャンクを取得
    this.devrec.ondataavailable = (e) => {
      if (!e.data) return;
      if (!cnkhed) {
        //console.log('bgn: hed'); // DBG
        cnkhed = e.data;
        //console.log('end: hed'); // DBG
        return;
      }
      if (!flgrec) {
        //console.log('sts: pre'); // DBG
        bufpre.push(e.data);
        if (bufpre.length > this.maxcnk) bufpre.shift();
      }
      else {
        //console.log('sts: bdy'); // DBG
        bufsnd.push(e.data);
      }
    };
  
    // ワークレットのイベントから、録音の開始〜停止を制御
    this.prcaud.port.onmessage = (e) => {
      const { evt } = e.data;
      //console.log('sts: evt: ', evt); // DBG
      if (evt === 'bgnSpk' && !flgrec) {
        console.log('bgn: record'); // DBG
        // 音声ヘッダの取得前は、チャンクの単位時間だけ待つ
        if (!cnkhed) {
          setTimeout(() => {
            //console.log('sts: nil: cnkhed'); // DBG
            bufsnd = [ cnkhed, ...bufpre ];
          }, this.unicnk);
        }
        else {
          //console.log('sts: yes: cnkhed'); // DBG
          bufsnd = [ cnkhed, ...bufpre ];
        }
        flgrec = true;
      }
      else if (evt === 'endSpk' && flgrec) {
        console.log('end: record'); // DBG
        this.devrec.stop();
      }
    };
  
    // 録音の終了時
    this.devrec.onstop = async () => {
      if (this.ctxaud.state == 'running') {
        const blbsnd = new Blob(bufsnd, { type: 'audio/webm' });      
        try {
          const objres = await fetch(this.adrgen, {
            method: 'POST',
            headers: {
              'Content-Type': 'audio/webm'
            },
            body: blbsnd
          });
          let dicres = await objres.json();
          let status = dicres['status'];
          console.log('sts: ', status); // DBG
        }
        catch (e) {
          console.error('err: ', e); // DBG
        }
      }
    }

    // エラーを取得
    this.devrec.onerror = (e) => console.error('err :', e);
  }

  updAud = () => {
  // 音声のコンテキストをリセット
    this.ctxaud.resume();
  }

  endAud = () => {
    // リソース群を返却
    this.ctxaud.close();
    this.stream.getTracks().forEach(t => t.stop());
  }
}

//--------------------------------------------------------------------------
// 音声：録音（音量を検知）：単一スレッド

export const SndVcr = class {

  constructor(adrgen, thdvol, mscend) {
    this.adrgen = adrgen;
    this.thdvol = thdvol;
    this.mscend = mscend;

    this.unicnk = 1000; // 録音チャンクの単位（ミリセカンド）
    this.maxcnk = 1; // 発声までの無音の時間を、どれくらい保持するか（録音チャンクの数で）
    this.buffft = 2048;
  }

  iniAud = async () => {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); // マイクとの接続
    this.ctxaud = new AudioContext();
    this.devrec = new MediaRecorder(this.stream);
    this.prcaud = this.ctxaud.createScriptProcessor(this.buffft, 1, 1);
    const source = this.ctxaud.createMediaStreamSource(this.stream);
    source.connect(this.prcaud);
    this.prcaud.connect(this.ctxaud.destination);
  }

  recVce = async () => {
    let bufpre = []; // 事前の録音
    let bufsnd = []; // 本体の録音
    let cnkhed = null; // 音声のヘッダ用（最初のチャンク）
    let timend = null; // 録音停止のタイマ
    let flgrec = false;
  
    // 録音を開始
    this.devrec.start(this.unicnk);
  
    // チャンクを取得
    this.devrec.ondataavailable = (e) => {
      if (!e.data) return;
      if (!cnkhed) {
        cnkhed = e.data;
        return;
      }
      if (!flgrec) {
        bufpre.push(e.data);
        if (bufpre.length > this.maxcnk) bufpre.shift();
      }
      else {
        bufsnd.push(e.data);
      }
    };
  
    // 発声／無音を検出
    this.prcaud.onaudioprocess = (e) => {
      if (!cnkhed) return; // 音声ヘッダの取得前はスキップ
      const input = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let v of input) sum += v * v;
      const rms = Math.sqrt(sum / input.length);
  
      if (rms > this.thdvol) {
        // 発声開始
        if (!flgrec) {
          flgrec = true;
          bufsnd = [ cnkhed, ...bufpre ];
          console.log('bgn: record'); // DBG
        }
        // 無音タイマを解除
        if (timend) {
          clearTimeout(timend);
          timend = null;
        }
      }
      else if (flgrec && !timend) {
        // 指定時間の無音で、録音を停止
        timend = setTimeout(() => {
          console.log('end: record'); // DBG
          this.devrec.stop();
        }, this.mscend);
      }
    };
  
    // 録音の終了時
    this.devrec.onstop = async () => {
      if (this.ctxaud.state == 'running') {
        const blbsnd = new Blob(bufsnd, { type: 'audio/webm' });      
        try {
          const objres = await fetch(this.adrgen, {
            method: 'POST',
            headers: {
              'Content-Type': 'audio/webm'
            },
            body: blbsnd
          });
          let dicres = await objres.json();
          let status = dicres['status'];
          console.log('sts: ', status); // DBG
        }
        catch (e) {
          console.error('err: ', e); // DBG
        }
      }
    }
  
    // エラーを取得
    this.devrec.onerror = (e) => console.error('err :', e);
  }

  updAud = () => {
  // 音声のコンテキストをリセット
    this.ctxaud.resume();
  }

  endAud = () => {
    // リソース群を返却
    this.prcaud.disconnect();
    this.ctxaud.close();
    this.stream.getTracks().forEach(t => t.stop());
  }
}

//--------------------------------------------------------------------------
// 音声：再生（一回の取得）

export const RcvVce = class {

  constructor(adrrcv) {
    this.adrrcv = adrrcv;
    this.ctxaud = new (window.AudioContext || window.webkitAudioContext)();
  }

// 音声を取得し、再生

  plyVce = async () => {
    try {
      const objres = await fetch(this.adrrcv, {
        method: 'POST'
      });
      const arrbuf = await objres.arrayBuffer();
      const sndbuf = await this.ctxaud.decodeAudioData(arrbuf);

      const source = this.ctxaud.createBufferSource();
      source.buffer = sndbuf;
      source.connect(this.ctxaud.destination);
      source.start(0);
    }
    catch (e) {
      console.error('err: ', e);
    }
  }

  updAud = () => {
  // 音声のコンテキストをリセット
    this.ctxaud.resume();
  }
}

//--------------------------------------------------------------------------
// 音声：再生（一回の取得、画像を切替）

export const ImgOld = {
  imgchr: null,
  arrimg: null,
  sclimg: null,
  poscox: null,
  poscoy: null
}

export const SwtImg = class {

  constructor(adrrcv, thdvol, adrswc, adrchr, imgchr, arrimg, sclimg, poscox, poscoy) {
    this.adrrcv = adrrcv;
    this.thdvol = thdvol;
    this.adrswc = adrswc;
    this.adrchr = adrchr;
    this.imgchr = imgchr;
    this.img001 = adrchr.replace('<c>', imgchr).replace('<m>', 'c');
    this.img002 = adrchr.replace('<c>', imgchr).replace('<m>', 'o');
    this.arrimg = arrimg; // 画像の配置方法：すべて下側に配置、左右の配置は画像の（左側が基準：'l' 、右側が基準：'r' 、中央が基準：'c' ）
    this.sclimg = sclimg; // 画像の大きさ（ウィンドウの高さに対する比率）
    this.poscox = poscox; // 画像の配置：横方向（ウィンドウの横幅に対する比率）
    this.poscoy = poscoy; // 画像の配置：縦方向（ウィンドウの高さに対する比率）

    this.imgtgt = null;
    this.keyimg = null;
    this.buffft = 256;

    // 音声のコンテキストを作成
    this.ctxaud = new (window.AudioContext || window.webkitAudioContext)();

    // スタイルを設定（CSS ）
    this.keyimg = document.getElementById('keyimg');
    if (! this.keyimg) {
      // 画像を作成（img ）
      this.imgtgt = document.createElement('img');
      this.imgtgt.src = this.img001;
      this.imgtgt.id = 'keyimg'; // 画像のＩＤ

      // 画像を追加（img ）
      document.body.appendChild(this.imgtgt);
      this.keyimg = document.getElementById('keyimg');
      this.arrImg(this.keyimg); // 画像の配置方法を設定
      this.keyimg.onload = ()=> this.appImg(this.keyimg); // 画像を表示
      ImgOld.imgchr = this.imgchr;
      ImgOld.arrimg = this.arrimg;
      ImgOld.sclimg = this.sclimg;
      ImgOld.poscox = this.poscox;
      ImgOld.poscoy = this.poscoy;
    }

    if (this.keyimg) {
      if (this.arrimg != ImgOld.arrimg || this.sclimg != ImgOld.sclimg || this.poscox != ImgOld.poscox || this.poscoy != ImgOld.poscoy ) {
        this.arrImg(this.keyimg); // 画像の配置方法を設定
        this.keyimg.onload = ()=> this.appImg(this.keyimg); // 画像を表示
        //this.appImg(this.keyimg); // 画像を表示
        ImgOld.arrimg = this.arrimg;
        ImgOld.sclimg = this.sclimg;
        ImgOld.poscox = this.poscox;
        ImgOld.poscoy = this.poscoy;
      }
    }

    window.addEventListener('resize', () => this.appImg(this.keyimg));
  }

  // キャラの画像を切り替え
  swtChr = async () => {
    if (this.adrswc && this.keyimg) {
      try {
        const objres = await fetch(this.adrswc, {
          method: 'POST'
        });
        if (objres.ok) {
          const imgchr = await objres.text();
          this.img001 = this.adrchr.replace('<c>', imgchr).replace('<m>', 'c');
          this.img002 = this.adrchr.replace('<c>', imgchr).replace('<m>', 'o');
          ImgOld.imgchr = imgchr;
        }
      }
      catch (e) {
        alert('err: ' + e);
      }
    }
  }

  // サウンドを取得〜サウンドの大きさに応じて、画像を切り替え
  plyVce = async () => {
    try {
      const objres = await fetch(this.adrrcv, {
        method: 'POST'
      });

      if (objres.ok) {
        const arrbuf = await objres.arrayBuffer();
        const sndbuf = await this.ctxaud.decodeAudioData(arrbuf);
        // バッファソースを作成
        const source = this.ctxaud.createBufferSource();
        source.buffer = sndbuf;

        // アナライザを作成
        const anaaud = this.ctxaud.createAnalyser();
        // アナライザを設定
        anaaud.fftSize = this.buffft;
        const lenbuf = anaaud.frequencyBinCount;
        const arrdat = new Uint8Array(lenbuf);

        source.connect(anaaud);
        anaaud.connect(this.ctxaud.destination);

        let flgvce = false;
        // 音量を検査
        const chkVol = () => {
          anaaud.getByteTimeDomainData(arrdat);
          let sumsqu = 0;
          for (let i = 0; i < lenbuf; i++) {
            const norvol = (arrdat[i] - 128) / 128; // 正規化（-1.0 - 1.0）
            sumsqu += norvol * norvol;
          }
          const numrms = Math.sqrt(sumsqu / lenbuf); // 計算（RMS ）

          // 閾値と比較し〜画像を切り替え
          if (numrms > this.thdvol && !flgvce) {
            //console.log(1); // DBG
            this.keyimg.src = this.img002; // 画像＃２
            flgvce = true;
          } else if (numrms <= this.thdvol && flgvce) {
            //console.log(0); // DBG
            this.keyimg.src = this.img001; // 画像＃１
            flgvce = false;
          }

          // 次のフレームで再度検査
          requestAnimationFrame(chkVol);
        };

        source.start(0);
        chkVol();
      }
      else {
        alert('err: ' + objres.statusText);
      }
    }
    catch (e) {
      console.error('err: ', e);
      alert('err: ' + e);
    }
  }

  // 画像を配置
  arrImg = (img) => {
    img.style.position = 'absolute';
    if (this.arrimg == 'l') {
      img.style.transformOrigin = 'bottom left';
    }
    if (this.arrimg == 'r') {
      img.style.transformOrigin = 'bottom right';
    }
    if (this.arrimg == 'c') {
      img.style.transformOrigin = 'bottom left';
    }
  }

  // 画像を配置
  appImg = (img) => {
    const winwth = window.innerWidth; // ウィンドウ幅を取得
    const winhgt = window.innerHeight; // ウィンドウ高さを取得
    const imghgt = img.naturalHeight;
    const imgscl = this.sclimg * (winhgt / imghgt);
    img.style.transform = 'scale(' + imgscl + ')'; // スケール
    img.style.bottom = (winhgt * this.poscoy) + 'px'; // 上下の配置
    if (this.arrimg == 'l') {
      img.style.left = (winwth * this.poscox) + 'px'; // 左右の配置
    }
    if (this.arrimg == 'r') {
      img.style.right = (winwth * this.poscox) + 'px'; // 左右の配置
    }
    if (this.arrimg == 'c') {
      img.style.left = ((winwth * this.poscox) - ((img.naturalWidth * imgscl) / 2)) + 'px'; // 左右の配置
    }
  }

  updAud = () => {
  // 音声のコンテキストをリセット
    this.ctxaud.resume();
  }
}
