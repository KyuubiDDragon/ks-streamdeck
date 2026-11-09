fx_version('cerulean')
game('gta5')
name('ks_streamdeck')
author('KyuubiSoft')
description('Standalone Elgato Stream Deck animation bridge')
version('1.2.0')
ui_page('html/index.html')
client_scripts({
    'config.lua',
    'client/registry.lua',
    'client/framework.lua',
    'client/main.lua',
    'client/providers.lua',
})
files({ 'html/index.html', 'html/bridge.js', 'adapters/*.lua' })
escrow_ignore({ 'config.lua', 'client/providers.lua', 'examples/*.lua', 'adapters/*.lua' })
