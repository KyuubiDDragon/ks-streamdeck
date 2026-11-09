-- Copy this file into YOUR animation resource and load it AFTER its animation
-- code. Adapt the four functions below; do not ensure this file as a resource.
-- Existing animation resource owns access checks, cleanup and native execution.
local function register()
    if GetResourceState('ks_streamdeck') ~= 'started' then
        return
    end
    exports.ks_streamdeck:RegisterAnimationProvider('my_emotes', {
        catalog = function()
            return {
                { id = 'wave', label = 'Winken', category = 'Gesten', keywords = 'wave hallo' },
            }
        end,
        current = function()
            -- Return 'wave' ONLY while its native task is really playing, else nil.
            return MyEmotes.GetActuallyPlayingId()
        end,
        play = function(id, canContinue)
            if id ~= 'wave' then
                return false, 'Animation nicht vorhanden.'
            end
            -- Your implementation must call canContinue() after any Wait/loading,
            -- immediately before starting. Return true only on actual start.
            return MyEmotes.PlayApprovedAnimation(id, canContinue)
        end,
        stop = function()
            -- Stop only your own animation, not another resource's task.
            MyEmotes.StopOwnAnimation()
            return true
        end,
        canPlay = function(id)
            return MyEmotes.CanUseAnimation(id)
        end,
    })
end
AddEventHandler('ks_streamdeck:ready', register)
CreateThread(function()
    Wait(0)
    register()
end)
-- Provider entries are automatically removed when this resource stops.
