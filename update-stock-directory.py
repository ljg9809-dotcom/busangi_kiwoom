"""Official KIS public KOSPI/KOSDAQ master -> browser search directory.
No API keys, no insecure TLS override, no third-party packages.
Source format: koreainvestment/open-trading-api/stocks_info.
"""
import datetime, io, json, pathlib, urllib.request, zipfile
root = pathlib.Path(__file__).resolve().parent
stocks = []
for market, tail in [('kospi', 228), ('kosdaq', 222)]:
    url = f'https://new.real.download.dws.co.kr/common/master/{market}_code.mst.zip'
    with urllib.request.urlopen(url, timeout=30) as response:
        archive = zipfile.ZipFile(io.BytesIO(response.read()))
    text = archive.read(f'{market}_code.mst').decode('cp949')
    for line in text.splitlines(keepends=True):
        head = line[:-tail]
        code, name = head[:9].strip(), head[21:].strip()
        if len(code) == 6 and code.isdigit() and name:
            stocks.append(dict(code=code, name=name, exchange=market.upper()))
directory = root / 'assets' / 'stocks'
directory.mkdir(parents=True, exist_ok=True)
payload = dict(updatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), source='한국투자증권 종목 마스터', stocks=stocks)
(directory / 'directory.js').write_text('window.BusangiStockDirectory='+json.dumps(payload, ensure_ascii=False, separators=(',', ':'))+';\n', encoding='utf-8')
print(f'Official stock directory saved: {len(stocks)} symbols')
