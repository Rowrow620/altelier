using System;
using System.Reflection;
using Harmony;
using UnityEngine;

namespace AtelierLobotomyTweaks
{
    public class Harmony_Patch
    {
        private const string HarmonyId = "com.rowrow620.atelier.lobotomy.tweaks";
        private static readonly BindingFlags AllFlags = BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
        internal static TweaksConfig Config = new TweaksConfig();

        public Harmony_Patch()
        {
            Config = TweaksConfig.Load(typeof(Harmony_Patch).Assembly.Location);
            if (!Config.UnlimitedLob && !Config.UnlimitedEgo && !Config.UnlockAllEgos && !Config.KeepAgentsForever && Config.SpeedMultiplier <= 0)
            {
                Debug.Log("[AtelierLobotomyTweaks] Loaded with all tweaks disabled.");
                return;
            }

            try
            {
                var harmony = HarmonyInstance.Create(HarmonyId);

                if (Config.UnlimitedLob)
                {
                    Patch(harmony, typeof(MoneyModel).GetMethod("EnoughCheck", AllFlags), typeof(LobAndEgoPatches), prefix: nameof(LobAndEgoPatches.EnoughCheck_Prefix));
                    Patch(harmony, typeof(MoneyModel).GetMethod("Pay", AllFlags), typeof(LobAndEgoPatches), prefix: nameof(LobAndEgoPatches.Pay_Prefix));
                    Patch(harmony, typeof(MoneyModel).GetMethod("LoadData", AllFlags), typeof(LobAndEgoPatches), postfix: nameof(LobAndEgoPatches.LoadData_Postfix));
                    Patch(harmony, typeof(DeployUI).GetMethod("Update", AllFlags), typeof(LobAndEgoPatches), postfix: nameof(LobAndEgoPatches.DeployUI_Update_Postfix));
                    Patch(harmony, typeof(DeployUI).GetMethod("GetHireText", AllFlags), typeof(LobAndEgoPatches), postfix: nameof(LobAndEgoPatches.GetHireText_Postfix));
                    Patch(harmony, typeof(DeployUI).GetMethod("BuyAgent", AllFlags), typeof(LobAndEgoPatches), prefix: nameof(LobAndEgoPatches.BuyAgent_Prefix));
                    Patch(harmony, typeof(DeployAgentList).GetMethod("Update", AllFlags), typeof(LobAndEgoPatches), postfix: nameof(LobAndEgoPatches.DeployAgentList_Update_Postfix));
                }

                if (Config.UnlimitedEgo)
                {
                    Patch(harmony, typeof(InventoryModel).GetMethod("CheckEquipmentCount", new[] { typeof(int) }), typeof(LobAndEgoPatches), prefix: nameof(LobAndEgoPatches.CheckEquipmentCount_Prefix));
                    PatchOptional(harmony, typeof(InventoryModel).GetMethod("CheckEquipmentCount_Mod", AllFlags), typeof(LobAndEgoPatches), prefix: nameof(LobAndEgoPatches.CheckEquipmentCount_Prefix));

                    Patch(harmony, typeof(InventoryModel).GetMethod("GetEquipCount", new[] { typeof(int), typeof(int).MakeByRefType(), typeof(int).MakeByRefType() }), typeof(LobAndEgoPatches), postfix: nameof(LobAndEgoPatches.GetEquipCount_Postfix));
                    PatchOptional(harmony, typeof(InventoryModel).GetMethod("GetEquipCount_Mod", AllFlags), typeof(LobAndEgoPatches), postfix: nameof(LobAndEgoPatches.GetEquipCount_Postfix));

                    Patch(harmony, typeof(EquipmentTypeList).GetMethod("Init", AllFlags), typeof(LobAndEgoPatches), postfix: nameof(LobAndEgoPatches.EquipmentTypeList_Init_Postfix));
                    PatchOptional(harmony, typeof(EquipmentTypeList).GetMethod("Init_Mod", AllFlags), typeof(LobAndEgoPatches), postfix: nameof(LobAndEgoPatches.EquipmentTypeList_Init_Postfix));
                }

                if (Config.UnlockAllEgos)
                {
                    Patch(harmony, typeof(CreatureObserveInfoModel).GetMethod("GetObserveState", new[] { typeof(string) }), typeof(LobAndEgoPatches), prefix: nameof(LobAndEgoPatches.GetObserveState_Prefix));
                    Patch(harmony, typeof(CreatureObserveInfoModel).GetMethod("GetObservationLevel", Type.EmptyTypes), typeof(LobAndEgoPatches), prefix: nameof(LobAndEgoPatches.GetObservationLevel_Prefix));
                    Patch(harmony, typeof(EquipmentModel).GetMethod("CheckRequire", new[] { typeof(UnitModel) }), typeof(LobAndEgoPatches), prefix: nameof(LobAndEgoPatches.CheckRequire_Prefix));
                }

                if (Config.KeepAgentsForever)
                {
                    Patch(harmony, typeof(AgentManager).GetMethod("AddPermantelyDeleteAgent", AllFlags), typeof(AgentPatches), prefix: nameof(AgentPatches.AddPermantelyDeleteAgent_Prefix));
                    Patch(harmony, typeof(AgentModel).GetMethod("OnReleaseWeapon", AllFlags), typeof(AgentPatches), prefix: nameof(AgentPatches.OnReleaseWeapon_Prefix));
                    Patch(harmony, typeof(AgentModel).GetMethod("OnReleaseArmor", AllFlags), typeof(AgentPatches), prefix: nameof(AgentPatches.OnReleaseArmor_Prefix));
                    Patch(harmony, typeof(AgentManager).GetMethod("OnStageEnd", AllFlags), typeof(AgentPatches), postfix: nameof(AgentPatches.OnStageEnd_Postfix));
                    Patch(harmony, typeof(DeployAgentList).GetMethod("Init", AllFlags), typeof(AgentPatches), postfix: nameof(AgentPatches.DeployAgentList_Init_Postfix));
                    Patch(harmony, typeof(InventoryModel).GetMethod("Init", AllFlags), typeof(AgentPatches), prefix: nameof(AgentPatches.InventoryInit_Prefix), postfix: nameof(AgentPatches.InventoryInit_Postfix));
                }

                if (Config.SpeedMultiplier > 0)
                {
                    Patch(harmony, typeof(GameManager).GetMethod("UpdateGameSpeed", AllFlags), typeof(SpeedPatches), postfix: nameof(SpeedPatches.UpdateGameSpeed_Postfix));
                }

                Debug.Log("[AtelierLobotomyTweaks] Initialized (" +
                    $"UnlimitedLob={Config.UnlimitedLob}, UnlimitedEgo={Config.UnlimitedEgo}, " +
                    $"UnlockAllEgos={Config.UnlockAllEgos}, KeepAgents={Config.KeepAgentsForever}, Speed={Config.SpeedMultiplier}x)");
            }
            catch (Exception ex)
            {
                Debug.LogError("[AtelierLobotomyTweaks] Initialization failed: " + ex);
            }
        }

        private static void Patch(HarmonyInstance harmony, MethodBase target, Type patchType, string prefix = null, string postfix = null)
        {
            if (target == null) throw new MissingMethodException("AtelierLobotomyTweaks target method not found");
            PatchOptional(harmony, target, patchType, prefix, postfix);
        }

        private static void PatchOptional(HarmonyInstance harmony, MethodBase target, Type patchType, string prefix = null, string postfix = null)
        {
            if (target == null) return;
            var pre = prefix != null ? new HarmonyMethod(patchType.GetMethod(prefix, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)) : null;
            var post = postfix != null ? new HarmonyMethod(patchType.GetMethod(postfix, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)) : null;
            harmony.Patch(target, pre, post);
        }
    }
}
