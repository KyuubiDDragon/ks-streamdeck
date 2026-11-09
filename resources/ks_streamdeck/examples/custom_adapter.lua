-- Load common.lua, then this file inside your animation resource. Replace MyEmotes with your API.
StreamDeckAdapter.install({
    catalog = function()
        local result = {}
        for id, animation in pairs(MyEmotes.GetCatalog()) do
            result[#result + 1] = {
                id = id,
                label = animation.label,
                category = animation.category,
                dict = animation.dictionary,
                clip = animation.clip,
            }
        end
        return result
    end,
    canPlay = function(entry)
        return MyEmotes.CanPlay(entry.id)
    end,
    play = function(entry)
        return MyEmotes.Play(entry.id)
    end,
    current = function(entry)
        return MyEmotes.GetCurrentId() == entry.id
    end,
    stop = function()
        return MyEmotes.Stop()
    end,
})
