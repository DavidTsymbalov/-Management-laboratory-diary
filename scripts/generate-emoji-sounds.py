"""Original short PCM cues; no third-party audio or application files are used."""
from pathlib import Path
import math, random, struct, wave
RATE=24000
OUT=Path(__file__).resolve().parents[1]/'public/sounds'
OUT.mkdir(exist_ok=True)

def tone(t,freq): return math.sin(2*math.pi*freq*t)
def pulse(t,start,length):
    x=(t-start)/length
    return math.sin(math.pi*x)**2 if 0<x<1 else 0

def render(kind,duration):
    rng=random.Random(kind)
    samples=[]; filtered=0; phase=0
    for i in range(int(duration*RATE)):
        t=i/RATE; x=t/duration; noise=rng.uniform(-1,1)
        filtered=.87*filtered+.13*noise
        env=math.sin(math.pi*x)**1.2
        if kind=='poop':
            freq=95+28*math.sin(t*43)+65*(1-x)
            phase+=2*math.pi*freq/RATE
            v=(.68*math.sin(phase)+.23*math.sin(phase*2.03)+filtered*.7)*env*(.65+.35*math.sin(t*84)**2)
        elif kind=='heart':
            v=(tone(t,68)+.25*tone(t,140))*(pulse(t,.01,.10)+.8*pulse(t,.15,.09))
        elif kind=='laugh':
            phase+=2*math.pi*(420+180*math.sin(t*15))/RATE
            v=math.sin(phase)*sum(pulse(t,s,.075) for s in [.01,.12,.23])*.8
        elif kind=='fire':
            v=(filtered*2.5+noise*(1 if i%139<12 else .08))*env*(.6+.4*math.sin(t*103)**2)
        elif kind=='clap':
            v=noise*(pulse(t,.002,.035)+.65*pulse(t,.055,.045)+.32*pulse(t,.12,.05))
        elif kind=='ghost':
            phase+=2*math.pi*(660-330*x+38*math.sin(t*44))/RATE
            v=(math.sin(phase)+.15*math.sin(phase*2))*env*.65
        elif kind=='party':
            v=noise*pulse(t,0,.035)*.6
            for n,f in enumerate([784,988,1175]): v+=tone(t,f)*pulse(t,.045+n*.06,.17)*.26
        elif kind=='zap':
            phase+=2*math.pi*(1300*(1-x)+100)/RATE
            v=(math.sin(phase)+filtered*.8)*env*(1-x)*.7
        samples.append(v)
    peak=max(abs(v) for v in samples) or 1
    # Consistent quiet peak with short fade at each boundary; no clipping or clicks.
    data=[]
    for i,v in enumerate(samples):
        edge=min(1,i/(RATE*.004),(len(samples)-1-i)/(RATE*.008))
        data.append(int(v/peak*.42*max(0,edge)*32767))
    with wave.open(str(OUT/f'emoji-{kind}.wav'),'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(RATE)
        f.writeframes(struct.pack('<'+'h'*len(data),*data))
    return len(data)/RATE
for name,seconds in [('poop',.38),('heart',.29),('laugh',.34),('fire',.25),('clap',.21),('ghost',.4),('party',.38),('zap',.18)]:
    print(f'{name}: {render(name,seconds):.2f}s')
