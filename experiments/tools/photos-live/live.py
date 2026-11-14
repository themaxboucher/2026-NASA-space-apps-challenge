import json,sys,datetime as dt
hz=json.load(open('hz.json'))
SOL=88775.244; K=SOL/86400
def table(key,cols):
    rows=hz[key]['rows']
    assert rows[0][0]==2461358.5  # 2026-11-14 00:00 UT
    pick={'earthAu':3,'sunAu':1,'sunKms':2}
    return {'start':'2026-11-14T00:00:00Z','stepDays':10,'cols':cols,
            'rows':[[round(r[pick[c]],6 if c!='sunKms' else 4) for c in cols] for r in rows]}
def hsrc(key): return {'name':'JPL Horizons ephemeris ('+hz[key]['src'].split(':',1)[1].split('{')[0].strip()+')','url':'https://ssd.jpl.nasa.gov/horizons/','retrieved':'2026-11-14'}
def anchor(sol,utc,lmst):
    h,m,s=lmst.split(':'); ms=int(h)*3600+int(m)*60+float(s)
    t=dt.datetime.fromisoformat(utc).replace(tzinfo=dt.timezone.utc)-dt.timedelta(seconds=ms*K)
    return {'n':sol,'startUtc':t.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]+'Z','solSeconds':SOL}
mars_tbl=table('mars',['earthAu'])
msrc=hsrc('mars')
L={'_about':'Reference values for live numbers in the browser (app/atlas/live.js). Distances are interpolated from JPL Horizons tables (10-day steps from 2026-11-14) and extrapolated past the end; sol numbers are counted from an anchor sol start; odometry is the last value NASA published (refreshed live when the MMGIS feed is reachable).'}
for k,launch,speed in [('voyager1','1977-09-05',True),('voyager2','1977-08-20',True),('newhorizons','2006-01-19',True),('juno','2011-08-05',False),('osiris_apex','2016-09-08',False)]:
    L[k]={'kind':'probe','since':launch,'table':table(k,['earthAu','sunAu','sunKms'] if speed else ['earthAu','sunAu']),'source':hsrc(k)}
L['osiris_apex']['countdown']={'date':'2029-04-13','label':'Days until asteroid Apophis flies past Earth','note':'OSIRIS-APEX is due to meet Apophis just after this close pass.'}
rov=lambda since,sol,odo,mmgis,feed,mapurl:{'kind':'rover','since':since,'sol':sol,'odometer':odo|{'source':{'name':'NASA rover location map (MMGIS)','url':mapurl},'liveUrl':mmgis},
     'latestImage':{'url':feed,'source':{'name':'NASA raw-image feed','url':'https://mars.nasa.gov/'}},'table':mars_tbl,'source':msrc}
L['curiosity']=rov('2012-08-06T05:17:57Z',anchor(5073,'2026-11-13T16:01:24.642','14:40:19.749')|{'source':{'name':'NASA raw-image feed: sol 5073 image taken 2026-11-13 16:01:24 UTC at 14:40:19 local mean solar time','url':'https://mars.nasa.gov/rss/api/?feed=raw_images&category=msl&feedtype=json&num=1&order=sol+desc'}},
    {'km':38.32,'sol':5073,'asOf':'2026-11-13'},'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints_current.json',
    'https://mars.nasa.gov/rss/api/?feed=raw_images&category=msl&feedtype=json&num=1&order=sol+desc','https://science.nasa.gov/mission/msl-curiosity/location-map/')
L['perseverance']=rov('2021-02-18T20:55:00Z',anchor(2031,'2026-11-06T12:16:25.848','11:30:55.785')|{'source':{'name':'NASA raw-image feed: sol 2031 image taken 2026-11-06 12:16:25 UTC at 11:30:55 local mean solar time','url':'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=1&order=sol+desc'}},
    {'km':45.25,'sol':2022,'asOf':'2026-10-28'},'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints_current.json',
    'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=1&order=sol+desc','https://science.nasa.gov/mission/mars-2020-perseverance/location-map/')
for k,d in [('apollo11-lrrr','1969-07-21'),('apollo14-lrrr','1971-02-05'),('apollo15-lrrr','1971-07-31')]:
    L[k]={'kind':'reflector','since':d,'source':{'name':'Moon distance: low-precision lunar theory (Meeus, Astronomical Algorithms, ch. 47)','url':'https://ssd.jpl.nasa.gov/horizons/'}}
json.dump(L,open(sys.argv[1],'w',encoding='utf-8'),separators=(',',':'),ensure_ascii=False)
print(L['curiosity']['sol'],L['perseverance']['sol'])
