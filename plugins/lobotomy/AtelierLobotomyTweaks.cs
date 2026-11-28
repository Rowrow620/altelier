using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using Harmony;
using UnityEngine;

namespace AtelierLobotomyTweaks
{
    public sealed class TweaksConfig
    {
        public bool UnlimitedLob;
        public bool UnlimitedEgo;
        public bool UnlockAllEgos;
        public bool KeepAgentsForever;
        public int SpeedMultiplier;

        public static TweaksConfig Load(string assemblyLocation)
        {
            var cfg = new TweaksConfig();
            try
            {
                if (string.IsNullOrEmpty(assemblyLocation)) return cfg;
                var asmDir = Path.GetDirectoryName(assemblyLocation);
                var modRoot = asmDir != null ? Path.GetDirectoryName(asmDir) : null;
                string[] candidates = {
                    asmDir != null ? Path.Combine(asmDir, "tweaks.cfg") : null,
                    modRoot != null ? Path.Combine(modRoot, "tweaks.cfg") : null,
                };
                foreach (var path in candidates)
                {
                    if (string.IsNullOrEmpty(path) || !File.Exists(path)) continue;
                    foreach (var raw in File.ReadAllLines(path))
                    {
                        var line = raw.Trim();
                        if (line.Length == 0 || line.StartsWith("#")) continue;
                        var eq = line.IndexOf('=');
                        if (eq <= 0) continue;
                        var key = line.Substring(0, eq).Trim();
                        var val = line.Substring(eq + 1).Trim();
                        if (key.Equals("UnlimitedLob", StringComparison.OrdinalIgnoreCase)) cfg.UnlimitedLob = IsTrue(val);
                        else if (key.Equals("UnlimitedEgo", StringComparison.OrdinalIgnoreCase)) cfg.UnlimitedEgo = IsTrue(val);
                        else if (key.Equals("UnlockAllEgos", StringComparison.OrdinalIgnoreCase)) cfg.UnlockAllEgos = IsTrue(val);
                        else if (key.Equals("KeepAgentsForever", StringComparison.OrdinalIgnoreCase)) cfg.KeepAgentsForever = IsTrue(val);
                        else if (key.Equals("SpeedMultiplier", StringComparison.OrdinalIgnoreCase) && int.TryParse(val, out var spd) && spd >= 0) cfg.SpeedMultiplier = spd;
                    }
                    break;
                }
            }
            catch (Exception ex)
            {
                Debug.LogError("[AtelierLobotomyTweaks] Config load failed: " + ex);
            }
            return cfg;
        }

        private static bool IsTrue(string val) =>
            val.Equals("true", StringComparison.OrdinalIgnoreCase) || val == "1";
    }

    public class Harmony_Patch
    {
        private const string HarmonyId = "com.rowrow620.atelier.lobotomy.tweaks";
        private static readonly BindingFlags AllFlags = BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
        internal static TweaksConfig Config = new TweaksConfig();

        private static readonly FieldInfo IsDeadField = AccessTools.Field(typeof(UnitModel), "_isDead");
        private static readonly FieldInfo DeadInitField = AccessTools.Field(typeof(AgentModel), "deadInit");
        private static List<EquipmentModel> _savedEquipmentBackup = new List<EquipmentModel>();

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
                    Patch(harmony, typeof(MoneyModel).GetMethod("EnoughCheck", AllFlags), prefix: nameof(EnoughCheck_Prefix));
                    Patch(harmony, typeof(MoneyModel).GetMethod("Pay", AllFlags), prefix: nameof(Pay_Prefix));
                    Patch(harmony, typeof(MoneyModel).GetMethod("LoadData", AllFlags), postfix: nameof(LoadData_Postfix));
                    Patch(harmony, typeof(DeployUI).GetMethod("Update", AllFlags), postfix: nameof(DeployUI_Update_Postfix));
                    Patch(harmony, typeof(DeployUI).GetMethod("GetHireText", AllFlags), postfix: nameof(GetHireText_Postfix));
                    Patch(harmony, typeof(DeployUI).GetMethod("BuyAgent", AllFlags), prefix: nameof(BuyAgent_Prefix));
                    Patch(harmony, typeof(DeployAgentList).GetMethod("Update", AllFlags), postfix: nameof(DeployAgentList_Update_Postfix));
                }

                if (Config.UnlimitedEgo)
                {
                    Patch(harmony, typeof(InventoryModel).GetMethod("CheckEquipmentCount", new[] { typeof(int) }), prefix: nameof(CheckEquipmentCount_Prefix));
                    PatchOptional(harmony, typeof(InventoryModel).GetMethod("CheckEquipmentCount_Mod", AllFlags), prefix: nameof(CheckEquipmentCount_Prefix));

                    Patch(harmony, typeof(InventoryModel).GetMethod("GetEquipCount", new[] { typeof(int), typeof(int).MakeByRefType(), typeof(int).MakeByRefType() }), postfix: nameof(GetEquipCount_Postfix));
                    PatchOptional(harmony, typeof(InventoryModel).GetMethod("GetEquipCount_Mod", AllFlags), postfix: nameof(GetEquipCount_Postfix));

                    Patch(harmony, typeof(EquipmentTypeList).GetMethod("Init", AllFlags), postfix: nameof(EquipmentTypeList_Init_Postfix));
                    PatchOptional(harmony, typeof(EquipmentTypeList).GetMethod("Init_Mod", AllFlags), postfix: nameof(EquipmentTypeList_Init_Postfix));
                }

                if (Config.UnlockAllEgos)
                {
                    Patch(harmony, typeof(CreatureObserveInfoModel).GetMethod("GetObserveState", new[] { typeof(string) }), prefix: nameof(GetObserveState_Prefix));
                    Patch(harmony, typeof(CreatureObserveInfoModel).GetMethod("GetObservationLevel", Type.EmptyTypes), prefix: nameof(GetObservationLevel_Prefix));
                    Patch(harmony, typeof(EquipmentModel).GetMethod("CheckRequire", new[] { typeof(UnitModel) }), prefix: nameof(CheckRequire_Prefix));
                }

                if (Config.KeepAgentsForever)
                {
                    Patch(harmony, typeof(AgentManager).GetMethod("AddPermantelyDeleteAgent", AllFlags), prefix: nameof(AddPermantelyDeleteAgent_Prefix));
                    Patch(harmony, typeof(AgentModel).GetMethod("OnReleaseWeapon", AllFlags), prefix: nameof(OnReleaseWeapon_Prefix));
                    Patch(harmony, typeof(AgentModel).GetMethod("OnReleaseArmor", AllFlags), prefix: nameof(OnReleaseArmor_Prefix));
                    Patch(harmony, typeof(AgentManager).GetMethod("OnStageEnd", AllFlags), postfix: nameof(OnStageEnd_Postfix));
                    Patch(harmony, typeof(DeployAgentList).GetMethod("Init", AllFlags), postfix: nameof(DeployAgentList_Init_Postfix));
                    Patch(harmony, typeof(InventoryModel).GetMethod("Init", AllFlags), prefix: nameof(InventoryInit_Prefix), postfix: nameof(InventoryInit_Postfix));
                }

                if (Config.SpeedMultiplier > 0)
                {
                    Patch(harmony, typeof(GameManager).GetMethod("UpdateGameSpeed", AllFlags), postfix: nameof(UpdateGameSpeed_Postfix));
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

        private static void Patch(HarmonyInstance harmony, MethodBase target, string prefix = null, string postfix = null)
        {
            if (target == null) throw new MissingMethodException("AtelierLobotomyTweaks target method not found");
            PatchOptional(harmony, target, prefix, postfix);
        }

        private static void PatchOptional(HarmonyInstance harmony, MethodBase target, string prefix = null, string postfix = null)
        {
            if (target == null) return;
            var pre = prefix != null ? new HarmonyMethod(typeof(Harmony_Patch).GetMethod(prefix, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)) : null;
            var post = postfix != null ? new HarmonyMethod(typeof(Harmony_Patch).GetMethod(postfix, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)) : null;
            harmony.Patch(target, pre, post);
        }

        // --- Unlimited LOB Points ---

        [HarmonyPriority(Priority.First)]
        public static bool EnoughCheck_Prefix(ref bool __result)
        {
            __result = true;
            return false;
        }

        [HarmonyPriority(Priority.First)]
        public static bool Pay_Prefix(ref bool __result)
        {
            if (MoneyModel.instance != null) MoneyModel.instance.money = 999999;
            __result = true;
            return false;
        }

        public static void LoadData_Postfix()
        {
            if (MoneyModel.instance != null) MoneyModel.instance.money = 999999;
        }

        public static void DeployUI_Update_Postfix(DeployUI __instance)
        {
            if (MoneyModel.instance != null) MoneyModel.instance.money = 999999;
            if (__instance != null && __instance.pointCount != null) __instance.pointCount.text = "\u221E";
        }

        [HarmonyPriority(Priority.Last)]
        public static void GetHireText_Postfix(bool isEnter, ref string __result)
        {
            if (isEnter)
            {
                __result = "LOB 1";
                return;
            }
            string hireStr = "Hire";
            try
            {
                if (LocalizeTextDataModel.instance != null) hireStr = LocalizeTextDataModel.instance.GetText("Hire");
            }
            catch { }
            __result = hireStr + " (\u221E)";
        }

        [HarmonyPriority(Priority.First)]
        public static bool BuyAgent_Prefix(DeployUI __instance)
        {
            if (MoneyModel.instance != null) MoneyModel.instance.money = 999999;
            __instance?.OpenCustomizingWindow();
            return false;
        }

        public static void DeployAgentList_Update_Postfix(DeployAgentList __instance)
        {
            if (__instance != null && __instance.HireText != null && DeployUI.instance != null)
            {
                __instance.HireText.text = DeployUI.instance.GetHireText(false);
            }
        }

        // --- Unlimited E.G.O Crafting ---

        [HarmonyPriority(Priority.First)]
        public static bool CheckEquipmentCount_Prefix(ref bool __result)
        {
            __result = true;
            return false;
        }

        public static void GetEquipCount_Postfix(ref int __2)
        {
            __2 = 999;
        }

        public static void EquipmentTypeList_Init_Postfix(EquipmentTypeList __instance)
        {
            IList<EquipmentTypeInfo> list = __instance?.GetAllData();
            if (list == null) return;
            foreach (EquipmentTypeInfo info in list)
            {
                if (info != null) info.maxNum = 999;
            }
        }

        // --- Unlock All E.G.O ---

        [HarmonyPriority(Priority.First)]
        public static bool GetObserveState_Prefix(ref bool __result)
        {
            __result = true;
            return false;
        }

        [HarmonyPriority(Priority.First)]
        public static bool GetObservationLevel_Prefix(ref int __result)
        {
            __result = 4;
            return false;
        }

        [HarmonyPriority(Priority.First)]
        public static bool CheckRequire_Prefix(ref bool __result)
        {
            __result = true;
            return false;
        }

        // --- Keep Agents Forever ---

        private static bool IsAgentDead(AgentModel agent)
        {
            if (agent == null) return false;
            if (IsDeadField != null && IsDeadField.GetValue(agent) is bool b) return b;
            return agent.hp <= 0;
        }

        private static void SetAgentAlive(AgentModel agent)
        {
            if (agent == null) return;
            IsDeadField?.SetValue(agent, false);
            DeadInitField?.SetValue(agent, false);
            agent.hp = agent.maxHp;
            agent.mental = agent.maxMental;
        }

        public static bool AddPermantelyDeleteAgent_Prefix() => false;

        public static bool OnReleaseWeapon_Prefix(AgentModel __instance) =>
            __instance == null || !IsAgentDead(__instance);

        public static bool OnReleaseArmor_Prefix(AgentModel __instance) =>
            __instance == null || !IsAgentDead(__instance);

        public static void OnStageEnd_Postfix() => ReviveAllAgents();

        public static void DeployAgentList_Init_Postfix() => ReviveAllAgents();

        private static void ReviveAllAgents()
        {
            IList<AgentModel> agents = AgentManager.instance?.GetAgentList();
            if (agents == null) return;
            foreach (AgentModel agent in agents)
            {
                if (IsAgentDead(agent)) SetAgentAlive(agent);
            }
        }

        public static void InventoryInit_Prefix()
        {
            if (InventoryModel.Instance?.equipList != null)
            {
                _savedEquipmentBackup = new List<EquipmentModel>(InventoryModel.Instance.equipList);
            }
        }

        public static void InventoryInit_Postfix()
        {
            if (InventoryModel.Instance == null || _savedEquipmentBackup == null || _savedEquipmentBackup.Count == 0) return;
            List<EquipmentModel> currentList = InventoryModel.Instance.equipList;
            if (currentList == null) return;
            foreach (EquipmentModel equip in _savedEquipmentBackup)
            {
                if (equip != null && InventoryModel.Instance.GetEquipment(equip.instanceId) == null)
                {
                    currentList.Add(equip);
                }
            }
        }

        // --- Speed Multipliers ---

        public static void UpdateGameSpeed_Postfix(GameManager __instance)
        {
            if (__instance == null || __instance.state != GameState.PLAYING || Config.SpeedMultiplier <= 0) return;
            if (__instance.gameSpeedLevel == 2)
            {
                float scale = Config.SpeedMultiplier;
                Time.timeScale = scale;
                Time.fixedDeltaTime = 0.02f * scale;
            }
            else if (__instance.gameSpeedLevel == 3)
            {
                float scale = Config.SpeedMultiplier * 2f;
                Time.timeScale = scale;
                Time.fixedDeltaTime = 0.02f * scale;
            }
        }
    }
}
