const assert = require('assert');
const ID3 = require('../src/id3.js');
const S = require('../src/sources.js');

function fakeAudio(n) {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i += 417) { a[i] = 0xff; a[i + 1] = 0xfb; a[i + 2] = 0x90; }
  return a;
}
function withV1(audio) {
  const v1 = new Uint8Array(128);
  v1.set([0x54, 0x41, 0x47]);
  const o = new Uint8Array(audio.length + 128);
  o.set(audio); o.set(v1, audio.length);
  return o;
}

// 1. round trip, CJK text, cover, no prior tag
const audio = fakeAudio(5000);
const cover = { mime: 'image/png', data: new Uint8Array([137, 80, 78, 71, 1, 2, 3, 255, 0, 255, 0]) };
const f1 = { title: '告白氣球', artist: '周杰倫', album: 'Jay Chou 周杰倫的床邊故事', albumArtist: '周杰倫', year: '2016', track: '3/10', genre: 'Mandopop', cover };
const out1 = ID3.write(audio, f1, {});
const p1 = ID3.parse(out1);
assert.strictEqual(p1.version, 3);
const r1 = ID3.readFields(p1).fields;
['title', 'artist', 'album', 'albumArtist', 'year', 'track', 'genre'].forEach(k => assert.strictEqual(r1[k], f1[k], k));
assert.strictEqual(r1.cover.mime, 'image/png');
assert.deepStrictEqual(Array.from(r1.cover.data), Array.from(cover.data));
assert.deepStrictEqual(Array.from(out1.subarray(p1.audioStart)), Array.from(audio));
assert.strictEqual(ID3.tagLength(out1.subarray(0, 10)), p1.audioStart);

// 2. rewrite an existing tag: audio untouched, old v1 stripped, unknown v2.3 frame preserved
const withTag = ID3.write(withV1(audio), { ...f1, cover: null }, { stripV1: false });
const tagEnd = ID3.parse(withTag).audioStart;
assert.strictEqual(withTag.length, tagEnd + 5000 + 128);
const stripped = ID3.write(withTag, { ...f1, title: 'New', cover: null }, { stripV1: true });
const ps = ID3.parse(stripped);
assert.strictEqual(stripped.length - ps.audioStart, 5000);
assert.strictEqual(ID3.readFields(ps).fields.title, 'New');
assert.strictEqual(ID3.readFields(ps).fields.cover, null);

// 3. v2.4 tag (utf-8, synchsafe sizes, TDRC) is read and converted
function ss(n) { return [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]; }
function f24(id, text, enc = 3) {
  const t = Buffer.from(text, 'utf8');
  const body = Buffer.concat([Buffer.from([enc]), t]);
  return Buffer.concat([Buffer.from(id), Buffer.from(ss(body.length)), Buffer.from([0, 0]), body]);
}
const frames = Buffer.concat([f24('TIT2', '晴天'), f24('TPE1', '周杰倫\u0000某人'), f24('TDRC', '2003-07-31'), f24('TPOS', '1/2'), f24('TXXX', 'x')]);
const tag24 = Buffer.concat([Buffer.from('ID3'), Buffer.from([4, 0, 0]), Buffer.from(ss(frames.length)), frames]);
const file24 = Buffer.concat([tag24, Buffer.from(audio)]);
const p24 = ID3.parse(new Uint8Array(file24));
assert.strictEqual(p24.version, 4);
const r24 = ID3.readFields(p24).fields;
assert.strictEqual(r24.title, '晴天');
assert.strictEqual(r24.artist, '周杰倫 / 某人');
assert.strictEqual(r24.year, '2003');
const conv = ID3.write(new Uint8Array(file24), r24, {});
const pc = ID3.parse(conv);
assert.strictEqual(pc.version, 3);
assert.ok(pc.frames.some(f => f.id === 'TPOS'), 'TPOS kept');
assert.ok(!pc.frames.some(f => f.id === 'TXXX'), 'TXXX dropped');
assert.strictEqual(pc.frames.filter(f => f.id === 'TDRC').length, 0);
assert.strictEqual(conv.length - pc.audioStart, 5000);

// 4. mojibake raw bytes: Big5 bytes stored as latin-1 frame
const big5 = new TextEncoder().encode('x'); // placeholder to ensure TextEncoder exists
const gbkLike = Buffer.from([0xa7, 0x69, 0xa4, 0xe5]); // Big5 for "告白"? just bytes
const fl = Buffer.concat([Buffer.from('TIT2'), Buffer.from([0, 0, 0, 5, 0, 0]), Buffer.from([0]), gbkLike]);
const tag23 = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0]), Buffer.from(ss(fl.length)), fl]);
const rr = ID3.readFields(ID3.parse(new Uint8Array(Buffer.concat([tag23, Buffer.from(audio)]))));
assert.deepStrictEqual(Array.from(rr.raw.title), Array.from(gbkLike));
assert.ok(new TextDecoder('big5').decode(rr.raw.title).length > 0);

// 5. no tag at all
const bare = ID3.parse(audio);
assert.strictEqual(bare.hasTag, false);
assert.strictEqual(ID3.write(audio, ID3.emptyFields(), {}).length, 10 + 1024 + 5000);

// 6. sources mapping
const it = S.mapItunes({ results: [{ trackName: 'Hello', artistName: 'Adele', collectionName: '25', releaseDate: '2015-10-23T07:00:00Z', trackNumber: 1, trackCount: 11, primaryGenreName: 'Pop', artworkUrl100: 'https://x/y/100x100bb.jpg' }] });
assert.strictEqual(it[0].year, '2015');
assert.strictEqual(it[0].track, '1/11');
assert.strictEqual(it[0].coverUrl, 'https://x/y/600x600bb.jpg');
const mb = S.mapMB({ recordings: [{ title: 'Hello', 'artist-credit': [{ name: 'Adele', joinphrase: '' }], releases: [
  { id: 'b', title: '25 (bootleg)', status: 'Bootleg', date: '2015', media: [{ 'track-count': 11, track: [{ number: '1' }] }] },
  { id: 'a', title: '25', status: 'Official', date: '2015-11-20', media: [{ 'track-count': 11, track: [{ number: '1' }] }] }] }] });
assert.strictEqual(mb[0].album, '25');
assert.strictEqual(mb[0].track, '1/11');
assert.strictEqual(mb[0].coverUrl, 'https://coverartarchive.org/release/a/front-500');
assert.strictEqual(S.mbQuery('He"llo', 'Adele'), 'recording:"He llo" AND artist:"Adele"');
assert.deepStrictEqual(S.guessFromName('03. Adele - Hello.mp3'), { artist: 'Adele', title: 'Hello' });
assert.deepStrictEqual(S.guessFromName('晴天.mp3'), { artist: '', title: '晴天' });

assert.strictEqual(S.mbQuery('a', 'b', 'c d'), 'recording:"a" AND artist:"b" AND release:"c d"');
const rk = S.rankByAlbum([{ album: 'Other' }, { album: 'Jay Chou Live' }, { album: 'Another' }, { album: 'jay chou' }], 'JAY CHOU');
assert.deepStrictEqual(rk.map(x => x.album), ['Jay Chou Live', 'jay chou', 'Other', 'Another']);
assert.strictEqual(S.rankByAlbum([{ album: 'x' }], '').length, 1);

// album lookup + matching
const ia = S.mapItunesAlbum({ results: [
  { wrapperType: 'collection', collectionName: '葉惠美', artistName: '周杰倫', releaseDate: '2003-07-31T07:00:00Z', primaryGenreName: 'Mandopop', artworkUrl100: 'https://x/100x100bb.jpg' },
  { wrapperType: 'track', trackName: '晴天', artistName: '周杰倫', trackNumber: 3, trackCount: 3, discNumber: 1 },
  { wrapperType: 'track', trackName: '以父之名', artistName: '周杰倫', trackNumber: 1, trackCount: 3, discNumber: 1 },
  { wrapperType: 'track', trackName: '懦夫', artistName: '周杰倫', trackNumber: 2, trackCount: 3, discNumber: 1 }] });
assert.strictEqual(ia.album, '葉惠美');
assert.strictEqual(ia.year, '2003');
assert.deepStrictEqual(ia.tracks.map(t => t.title), ['以父之名', '懦夫', '晴天']);
assert.strictEqual(ia.tracks[2].track, '3/3');
assert.strictEqual(ia.coverUrl, 'https://x/600x600bb.jpg');
assert.strictEqual(S.mapItunes({ results: [{ trackName: 'a', collectionId: 42 }] })[0].collectionId, 42);

const ma = S.mapMBAlbum({ id: 'rid', title: '葉惠美', date: '2003-07-31', 'artist-credit': [{ name: '周杰倫', joinphrase: '' }],
  media: [{ position: 1, 'track-count': 2, tracks: [
    { position: 1, title: '以父之名', recording: { title: 'x' }, 'artist-credit': [{ name: '周杰倫', joinphrase: '' }] },
    { position: 2, recording: { title: '懦夫', 'artist-credit': [{ name: '周杰倫', joinphrase: '' }] } }] }] });
assert.strictEqual(ma.tracks[1].title, '懦夫');
assert.strictEqual(ma.tracks[1].artist, '周杰倫');
assert.strictEqual(ma.tracks[1].track, '2/2');
assert.strictEqual(ma.coverUrl, 'https://coverartarchive.org/release/rid/front-500');
assert.strictEqual(S.mapMB({ recordings: [{ title: 't', releases: [{ id: 'zz', title: 'A', media: [{}] }] }] })[0].releaseId, 'zz');

assert.strictEqual(S.trackNoFrom('3/12', ''), 3);
assert.strictEqual(S.trackNoFrom('', '07 - foo.mp3'), 7);
assert.strictEqual(S.trackNoFrom('', '2003 foo.mp3'), null);
const tr = [{ title: '以父之名', no: 1 }, { title: '懦夫', no: 2 }, { title: '晴天', no: 3 }, { title: 'Hello (Live)', no: 4 }];
const files = [
  { title: '晴天', name: 'a.mp3', no: null },          // exact title
  { title: '', name: '02 懦夫.mp3', no: 2 },           // from file name
  { title: 'unknown', name: 'zz.mp3', no: 1 },         // number only
  { title: 'hello', name: 'h.mp3', no: null },         // contains
  { title: 'nothing', name: 'q.mp3', no: null }        // no match
];
assert.deepStrictEqual(S.matchTracks(files, tr), [2, 1, 0, 3, -1]);
// one track is never given to two files
assert.deepStrictEqual(S.matchTracks([{ title: '晴天', name: 'a', no: null }, { title: '晴天', name: 'b', no: null }], tr).filter(x => x === 2).length, 1);
assert.strictEqual(S.matchTracks([], tr).length, 0);

console.log('all tests passed');
