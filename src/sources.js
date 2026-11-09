/* Search-result mapping for iTunes Search API and MusicBrainz. Pure functions, no network. */
(function (root) {
  'use strict';

  function year(s) {
    var m = String(s || '').match(/\d{4}/);
    return m ? m[0] : '';
  }

  // iTunes Search API -> rows
  function mapItunes(json) {
    return ((json && json.results) || [])
      .filter(function (r) { return r.trackName; })
      .map(function (r) {
        var art = r.artworkUrl100 || r.artworkUrl60 || '';
        return {
          source: 'iTunes',
          title: r.trackName || '',
          artist: r.artistName || '',
          album: r.collectionName || '',
          albumArtist: '',
          year: year(r.releaseDate),
          track: r.trackNumber ? r.trackNumber + (r.trackCount ? '/' + r.trackCount : '') : '',
          genre: r.primaryGenreName || '',
          collectionId: r.collectionId || '',
          thumb: art.replace(/\d+x\d+bb/, '120x120bb'),
          coverUrl: art.replace(/\d+x\d+bb/, '600x600bb')
        };
      });
  }

  function credit(ac) {
    return (ac || []).map(function (c) { return (c.name || (c.artist && c.artist.name) || '') + (c.joinphrase || ''); }).join('').trim();
  }

  // MusicBrainz recording search -> rows (one row per release, official releases first)
  function mapMB(json) {
    var rows = [];
    ((json && json.recordings) || []).forEach(function (rec) {
      var artist = credit(rec['artist-credit']);
      (rec.releases || []).forEach(function (rel) {
        var media = (rel.media && rel.media[0]) || {};
        var trk = (media.track && media.track[0]) || {};
        var total = media['track-count'] || rel['track-count'];
        var num = trk.number || '';
        rows.push({
          source: 'MusicBrainz',
          title: rec.title || '',
          artist: artist,
          album: rel.title || '',
          albumArtist: credit(rel['artist-credit']),
          year: year(rel.date || rec['first-release-date']),
          track: num ? num + (total ? '/' + total : '') : '',
          genre: '',
          releaseId: rel.id,
          thumb: 'https://coverartarchive.org/release/' + rel.id + '/front-250',
          coverUrl: 'https://coverartarchive.org/release/' + rel.id + '/front-500',
          official: rel.status === 'Official' ? 0 : 1
        });
      });
    });
    rows.sort(function (a, b) { return a.official - b.official; });
    return rows.slice(0, 15);
  }

  function lucene(s) {
    return String(s).replace(/["\\]/g, ' ').trim();
  }
  function mbQuery(title, artist, album) {
    var parts = [];
    if (title) parts.push('recording:"' + lucene(title) + '"');
    if (artist) parts.push('artist:"' + lucene(artist) + '"');
    if (album) parts.push('release:"' + lucene(album) + '"');
    return parts.join(' AND ');
  }

  // Move rows whose album contains the wanted album name to the front (stable)
  function rankByAlbum(rows, album) {
    var w = String(album || '').trim().toLowerCase();
    if (!w) return rows;
    return rows
      .map(function (r, i) { return { r: r, i: i, hit: String(r.album || '').toLowerCase().indexOf(w) >= 0 ? 0 : 1 }; })
      .sort(function (a, b) { return a.hit - b.hit || a.i - b.i; })
      .map(function (x) { return x.r; });
  }


  // iTunes lookup?id=<collectionId>&entity=song -> album info + track list
  function mapItunesAlbum(json) {
    var res = (json && json.results) || [];
    var col = res.filter(function (x) { return x.wrapperType === 'collection'; })[0] || {};
    var trk = res.filter(function (x) { return x.trackName; });
    trk.sort(function (a, b) { return (a.discNumber || 1) - (b.discNumber || 1) || (a.trackNumber || 0) - (b.trackNumber || 0); });
    var art = col.artworkUrl100 || (trk[0] && trk[0].artworkUrl100) || '';
    return {
      album: col.collectionName || (trk[0] && trk[0].collectionName) || '',
      albumArtist: col.artistName || '',
      year: year(col.releaseDate || (trk[0] && trk[0].releaseDate)),
      genre: col.primaryGenreName || (trk[0] && trk[0].primaryGenreName) || '',
      coverUrl: art.replace(/\d+x\d+bb/, '600x600bb'),
      tracks: trk.map(function (t, i) {
        return {
          title: t.trackName, artist: t.artistName || '', no: t.trackNumber || i + 1,
          track: t.trackNumber ? t.trackNumber + (t.trackCount ? '/' + t.trackCount : '') : '',
          disc: t.discNumber || 1
        };
      })
    };
  }

  // MusicBrainz release?inc=recordings+artist-credits -> album info + track list
  function mapMBAlbum(json) {
    var tracks = [];
    ((json && json.media) || []).forEach(function (m, mi) {
      (m.tracks || []).forEach(function (t) {
        var rec = t.recording || {};
        var pos = t.position || 0;
        tracks.push({
          title: t.title || rec.title || '',
          artist: credit(t['artist-credit']) || credit(rec['artist-credit']),
          no: pos,
          track: pos ? pos + '/' + (m['track-count'] || (m.tracks || []).length) : '',
          disc: m.position || mi + 1
        });
      });
    });
    return {
      album: (json && json.title) || '',
      albumArtist: credit(json && json['artist-credit']),
      year: year(json && json.date),
      genre: '',
      coverUrl: json && json.id ? 'https://coverartarchive.org/release/' + json.id + '/front-500' : '',
      tracks: tracks
    };
  }

  function norm(s) {
    return String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  }
  // Track number from "3", "3/12", or a leading number in a file name ("03 - Title.mp3")
  function trackNoFrom(tag, fileName) {
    var m = String(tag || '').match(/^\s*(\d{1,3})/);
    if (m) return +m[1];
    m = String(fileName || '').match(/^\s*(\d{1,3})(?=[\s.\-)_])/);
    return m ? +m[1] : null;
  }

  // files: [{ title, name, no }]   tracks: [{ title, no }]  ->  array (per file) of track index or -1
  // Title match wins over file-name match, which wins over track number alone. One track per file.
  function matchTracks(files, tracks) {
    var pairs = [];
    files.forEach(function (f, fi) {
      var ft = norm(f.title), fn = norm(String(f.name || '').replace(/\.[^.]+$/, ''));
      tracks.forEach(function (t, ti) {
        var tt = norm(t.title), sc = 0;
        if (tt) {
          if (ft && ft === tt) sc = 10;
          else if (ft && ft.length >= 2 && tt.length >= 2 && (ft.indexOf(tt) >= 0 || tt.indexOf(ft) >= 0)) sc = 6;
          else if (tt.length >= 2 && fn.indexOf(tt) >= 0) sc = 5;
        }
        if (f.no != null && t.no === f.no) sc = sc ? sc + 1 : 2;
        if (sc) pairs.push({ fi: fi, ti: ti, sc: sc });
      });
    });
    pairs.sort(function (a, b) { return b.sc - a.sc || a.fi - b.fi || a.ti - b.ti; });
    var out = files.map(function () { return -1; }), used = {};
    pairs.forEach(function (p) {
      if (out[p.fi] === -1 && !used[p.ti]) { out[p.fi] = p.ti; used[p.ti] = true; }
    });
    return out;
  }

  // "Artist - Title.mp3" -> { artist, title }
  function guessFromName(name) {
    var base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/^\s*\d{1,3}[\s.\-)]+(?=\D)/, '').trim();
    var i = base.indexOf(' - ');
    if (i > 0) return { artist: base.slice(0, i).trim(), title: base.slice(i + 3).trim() };
    return { artist: '', title: base };
  }

  var api = {
    mapItunes: mapItunes, mapMB: mapMB, mbQuery: mbQuery, rankByAlbum: rankByAlbum, guessFromName: guessFromName,
    mapItunesAlbum: mapItunesAlbum, mapMBAlbum: mapMBAlbum, matchTracks: matchTracks, trackNoFrom: trackNoFrom
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sources = api;
})(typeof self !== 'undefined' ? self : this);
