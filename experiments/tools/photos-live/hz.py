import sys,json,urllib.request,urllib.parse,time
sys.stdout.reconfigure(encoding='utf-8')
out={}
for key,cmd in [('voyager1','-31'),('voyager2','-32'),('newhorizons','-98'),('juno','-61'),('osiris_apex','-64'),('mars','499')]:
    p={'format':'json','COMMAND':f"'{cmd}'",'OBJ_DATA':'NO','MAKE_EPHEM':'YES','EPHEM_TYPE':'OBSERVER','CENTER':"'500@399'",
       'START_TIME':"'2026-11-14'",'STOP_TIME':"'2027-11-15'",'STEP_SIZE':"'10d'",'QUANTITIES':"'19,20'",'CSV_FORMAT':'YES','CAL_FORMAT':'JD'}
    d=json.load(urllib.request.urlopen('https://ssd.jpl.nasa.gov/api/horizons.api?'+urllib.parse.urlencode(p),timeout=60))
    r=d['result']
    if '$$SOE' not in r: print(key,'NO DATA',r[-600:]); continue
    src=[l for l in r.splitlines() if l.startswith('Target body name')][0]
    rows=[]
    for l in r.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines():
        f=[x.strip() for x in l.split(',')]
        rows.append([float(f[0]),float(f[3]),float(f[4]),float(f[5]),float(f[6])])
    out[key]={'src':src,'rows':rows}
    print(key,src,len(rows),rows[0],rows[-1])
    time.sleep(1)
json.dump(out,open('hz.json','w'))
