// wo eigene elemente eingefuegt werden
// erster sichtbarer treffer gewinnt sonst erster unsichtbarer
export const anchors = {
  'top.buttons': {
    label: 'Kopfzeile rechts',
    sel: ['ytd-masthead #end #buttons', 'ytd-masthead #buttons', '#masthead #end']
  },
  'watch.actions': {
    label: 'Aktionsleiste unter dem Video (vor ⋯)',
    // eigene buttons vor den menue knopf, nie in youtubes button listen
    sel: [
      'ytd-watch-metadata #actions ytd-menu-renderer > yt-button-shape#button-shape',
      'ytd-watch-metadata #actions ytd-menu-renderer > yt-icon-button#button',
      'ytd-watch-metadata #actions ytd-menu-renderer > :last-child'
    ]
  },
  'watch.titleRow': {
    label: 'Unter dem Videotitel',
    sel: ['ytd-watch-metadata #title', 'ytd-watch-metadata #above-the-fold #title']
  },
  'transcript.panelHeader': {
    label: 'Kopf des Transkript-Panels',
    visibleOnly: true,
    sel: [
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"] ytd-engagement-panel-title-header-renderer #title-container',
      'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"] ytd-engagement-panel-title-header-renderer #title-container'
    ]
  },
  'player.timeDisplay': {
    label: 'Zeitanzeige im Player',
    sel: ['#movie_player .ytp-time-display .ytp-time-contents', '#movie_player .ytp-time-display']
  },
  'player.rightControls': {
    label: 'Player-Buttons rechts',
    sel: ['#movie_player .ytp-right-controls-left', '#movie_player .ytp-right-controls']
  },
  'playlist.header': {
    label: 'Playlist-Kopf Statistik',
    sel: [
      'ytd-browse[page-subtype="playlist"] ytd-playlist-byline-renderer',
      'ytd-browse[page-subtype="playlist"] yt-page-header-view-model yt-content-metadata-view-model',
      'ytd-browse[page-subtype="playlist"] ytd-playlist-header-renderer .metadata-stats',
      'ytd-browse[page-subtype="playlist"] #header'
    ]
  },
  'watch.playlistHeader': {
    label: 'Playlist-Panel Kopf',
    sel: ['ytd-watch-flexy ytd-playlist-panel-renderer#playlist #header-description', 'ytd-watch-flexy ytd-playlist-panel-renderer#playlist #header-contents']
  }
}
