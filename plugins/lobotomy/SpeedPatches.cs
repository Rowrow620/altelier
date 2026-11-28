using UnityEngine;

namespace AtelierLobotomyTweaks
{
    public static class SpeedPatches
    {
        public static void UpdateGameSpeed_Postfix(GameManager __instance)
        {
            if (__instance == null || __instance.state != GameState.PLAYING || Harmony_Patch.Config.SpeedMultiplier <= 0) return;
            if (__instance.gameSpeedLevel == 2)
            {
                float scale = Harmony_Patch.Config.SpeedMultiplier;
                Time.timeScale = scale;
                Time.fixedDeltaTime = 0.02f * scale;
            }
            else if (__instance.gameSpeedLevel == 3)
            {
                float scale = Harmony_Patch.Config.SpeedMultiplier * 2f;
                Time.timeScale = scale;
                Time.fixedDeltaTime = 0.02f * scale;
            }
        }
    }
}
