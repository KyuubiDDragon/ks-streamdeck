StreamDeckConfig = {
    Enabled = true,
    Command = 'streamdeck',
    Port = 39175, -- Must match the companion plugin. Bind address is always loopback.
    ServerLabel = 'FiveM', -- Display name; not an authentication secret.
    ServerId = '', -- Optional stable suffix. Connection endpoint is always included.
    Locale = 'de',
    Provider = 'auto', -- Registered adapters, optional ks_animations, otherwise builtin.
    Framework = 'auto', -- auto / standalone / qbcore / qbox / esx
    FrameworkResources = { qbcore = 'qb-core', qbox = 'qbx_core', esx = 'es_extended' },
    BlockedStates = {
        'isDead',
        'isdead',
        'inlaststand',
        'ishandcuffed',
        'isHandcuffed',
        'isLimited',
        'inSynchronizedEmote',
    },
    DenyFalseStates = { 'canEmote' },
    BlockWhileUIFocused = true,
    SnapshotInterval = 1000,
    CatalogRefreshInterval = 5000,
    -- Optional extra rules. Called again after loading, before starting an animation.
    CanPlay = function()
        return true
    end,
    -- Only these native animations are available in builtin mode. No remote dicts/code/events.
    Animations = {
        {
            id = 'wave',
            label = 'Winken',
            category = 'Gesten',
            dict = 'friends@frj@ig_1',
            clip = 'wave_a',
            flags = 48,
            duration = 3000,
        },
        {
            id = 'arms_crossed',
            label = 'Arme verschränken',
            category = 'Posen',
            dict = 'anim@heists@heist_corona@single_team',
            clip = 'single_team_loop_boss',
            flags = 49,
        },
        {
            id = 'think',
            label = 'Nachdenken',
            category = 'Posen',
            dict = 'missheist_jewelleader',
            clip = 'intruder_wait_idle',
            flags = 49,
        },
        {
            id = 'salute',
            label = 'Salutieren',
            category = 'Gesten',
            dict = 'anim@mp_player_intincarsalutestd@ds@',
            clip = 'idle_a',
            flags = 49,
        },
        {
            id = 'clap',
            label = 'Applaudieren',
            category = 'Gesten',
            dict = 'amb@world_human_cheering@male_a',
            clip = 'base',
            flags = 49,
        },
    },
}
