-- Framework-independent provider registry; only registered animation IDs cross the bridge.
StreamDeckRegistry = {}
function StreamDeckRegistry.new()
    local self = { providers = {}, entries = {}, catalog = {}, busy = false }
    local function validId(value)
        return type(value) == 'string'
            and #value > 0
            and #value <= 64
            and value:match('^[%w_.-]+$') ~= nil
    end
    local function text(value, maximum)
        return type(value) == 'string' and #value > 0 and #value <= maximum
    end
    local function callable(value)
        if type(value) == 'function' then
            return true
        end
        local mt = type(value) == 'table' and getmetatable(value)
        return type(mt) == 'table' and type(mt.__call) == 'function'
    end
    function self:register(owner, id, provider)
        if not validId(id) or type(owner) ~= 'string' or type(provider) ~= 'table' then
            return false, 'Ungültiger Anbieter.'
        end
        if self.providers[id] and self.providers[id].owner ~= owner then
            return false, 'Anbieter bereits belegt.'
        end
        for _, key in ipairs({ 'catalog', 'play', 'stop', 'current' }) do
            if not callable(provider[key]) then
                return false, 'Anbieter benötigt ' .. key
            end
        end
        if provider.canPlay ~= nil and not callable(provider.canPlay) then
            return false, 'Anbieter benötigt eine aufrufbare canPlay-Prüfung.'
        end
        self.providers[id] = { owner = owner, api = provider }
        self:refresh()
        return true
    end
    function self:remove(owner, id)
        local provider = self.providers[id]
        if not provider or provider.owner ~= owner then
            return false
        end
        self.providers[id] = nil
        self:refresh()
        return true
    end
    function self:removeOwner(owner)
        for id, provider in pairs(self.providers) do
            if provider.owner == owner then
                self.providers[id] = nil
            end
        end
        self:refresh()
    end
    function self:refresh()
        local catalog, entries = {}, {}
        local ids = {}
        for id in pairs(self.providers) do
            ids[#ids + 1] = id
        end
        table.sort(ids)
        for _, id in ipairs(ids) do
            local provider = self.providers[id]
            local ok, items = pcall(provider.api.catalog)
            if ok and type(items) == 'table' then
                for _, item in ipairs(items) do
                    if #catalog >= 10000 then
                        break
                    end
                    if
                        type(item) == 'table'
                        and validId(item.id)
                        and text(item.label, 96)
                        and text(item.category, 64)
                    then
                        local fullId = id .. ':' .. item.id
                        if not entries[fullId] then
                            entries[fullId] = { provider = id, animation = item.id }
                            catalog[#catalog + 1] = {
                                id = fullId,
                                label = item.label,
                                category = item.category,
                                keywords = type(item.keywords) == 'string'
                                        and item.keywords:sub(1, 256)
                                    or '',
                            }
                        end
                    end
                end
            end
        end
        table.sort(catalog, function(a, b)
            if a.label == b.label then
                return a.id < b.id
            end
            return a.label < b.label
        end)
        self.catalog, self.entries = catalog, entries
    end
    function self:current()
        for id, provider in pairs(self.providers) do
            local ok, value = pcall(provider.api.current)
            if ok and type(value) == 'string' and self.entries[id .. ':' .. value] then
                return id .. ':' .. value
            end
        end
    end
    function self:stop()
        for _, provider in pairs(self.providers) do
            local ok, current = pcall(provider.api.current)
            if ok and current then
                local success, result, message = pcall(provider.api.stop)
                if not success or result == false then
                    return false, message or 'Animation konnte nicht gestoppt werden.'
                end
            end
        end
        return true
    end
    function self:execute(command, animation, guard)
        if self.busy then
            return false, 'Eine Animation wird gerade geladen.'
        end
        if command ~= 'play' and command ~= 'toggle' and command ~= 'stop' then
            return false, 'Ungültige Aktion.'
        end
        local entry = self.entries[animation]
        if command ~= 'stop' and not entry then
            return false, 'Animation nicht verfügbar.'
        end
        if command == 'stop' or (command == 'toggle' and self:current() == animation) then
            return self:stop()
        end
        local allowed, reason = guard()
        if not allowed then
            return false, reason
        end
        local provider = self.providers[entry.provider]
        if provider.api.canPlay then
            local ok, ready, message = pcall(provider.api.canPlay, entry.animation)
            if not ok or ready ~= true then
                return false, message or 'Animation derzeit nicht verfügbar.'
            end
        end
        local originalGuard = guard
        guard = function()
            if self.providers[entry.provider] ~= provider or not self.entries[animation] then
                return false, 'Animationsanbieter wurde neu gestartet.'
            end
            return originalGuard()
        end
        self.busy = true
        local ok, success, message = pcall(function()
            local stopped, stopError = self:stop()
            if not stopped then
                return false, stopError
            end
            -- Providers must call guard() after yielding, immediately before TaskPlayAnim.
            return provider.api.play(entry.animation, guard)
        end)
        self.busy = false
        if not ok then
            print(
                ('[ks_streamdeck] Animation provider %s failed: %s'):format(
                    entry.provider,
                    tostring(success)
                )
            )
            return false, 'Animationsanbieter hat einen Fehler gemeldet.'
        end
        if success ~= true then
            return false, message or 'Animation konnte nicht gestartet werden.'
        end
        return true
    end
    return self
end
