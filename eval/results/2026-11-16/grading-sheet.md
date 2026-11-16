# Blind grading sheet

40 pairs of answers to questions of the evaluation. In each pair, which answer is A and which is B was decided at random, and nothing tells where an answer comes from. Pairs 21 to 40 were added later and are graded the same way.

For each pair: read the question and the reference (open it with a click), then answers A and B, and decide which one serves the reader better: correct first, then complete, fair and clear.

Write your choice in `grades.txt`, next to this file: one line per pair, `A`, `B` or `tie` after its number (`7: B`). Leave a line empty to skip a pair. Then rebuild the report with `pnpm cli eval --set <set> --report --out <this folder>`: it reads your grades and makes no model call.

---

## Pair 1

**Question:** Cómo armo un presupuesto mensual si cobro en pesos y los precios suben todo el tiempo?

<details><summary>Grading guide</summary>

Pasos esenciales: registrar ingresos y todos los gastos (fijos y variables) un mes o dos, separar los esenciales de los prescindibles, fijar montos por rubro y revisarlos cada mes según la inflación, apartar el ahorro apenas se cobra, armar un fondo de emergencia, adelantar compras que convienen y evitar financiar consumo con tarjeta a tasas altas. Cautelas: no dejar los ahorros quietos en pesos sin rendimiento (plazo fijo, fondos money market, instrumentos ajustados por inflación), cuidado con las cuotas que se acumulan y con las promesas de rendimiento sin riesgo; sin dar consejo de inversión individual.

</details>

### Answer A

> La respuesta corta: armá el presupuesto cada mes, en porcentajes de tu ingreso neto y no en montos fijos en pesos, y revisalo cada semana o al menos al empezar el mes siguiente, porque cambian los ingresos, los gastos y los precios.
>
> Los precios siguen subiendo. Según el INDEC, la inflación fue de 2,2% en octubre de 2026 (1,9% en septiembre), con 26,3% acumulado en diez meses y 33,1% interanual. Por otro lado, la inflación de Argentina en 2025 fue de alrededor de 31,5% anual, con algunos meses recientes entre 2% y 3%, como 2,8% en diciembre y 2,9% en febrero. Con variaciones de ese orden, un número anotado a principio de año queda viejo en pocos meses.
>
> Basá el presupuesto en lo que realmente vas a cobrar. Si tus ingresos varían, usá una base conservadora, como el promedio de los meses más bajos, y tratá aguinaldo, bonos o changas como ingresos extra con destino definido de antemano. No cuentes aumentos ni trabajos extra hasta que estén confirmados.
>
> Apenas cobrás, separá primero el ahorro y no lo que quede a fin de mes. Si el objetivo es preservar valor, no lo dejes ocioso en pesos: ponelo en un instrumento que intente seguirle el ritmo a la inflación.
>
> Ese ahorro puede ir a una cuenta remunerada o a un fondo money market de rescate inmediato para la liquidez de corto plazo, o a un plazo fijo corto. Para plazos más largos existen plazos fijos UVA, bonos atados a la inflación o al dólar, y el dólar MEP dentro de las reglas vigentes. Esto no es asesoramiento de inversión y conviene comparar el rendimiento con la inflación del momento, que cambia mucho.
>
> Para el colchón o fondo de emergencia, una meta habitual es tener de 3 a 6 meses de gastos esenciales, guardado en instrumentos que intenten seguir la inflación.
>
> Los gastos fijos y los que más suben conviene pagarlos o separarlos el mismo día de cobro, y hacer temprano la compra grande de productos no perecederos (limpieza, secos, higiene), porque el dinero que queda quieto pierde poder de compra. Los frescos se compran semana a semana. Anotá el monto real del mes, no el del mes pasado.
>
> Como guía de partida, no como regla fija, se reparte el ingreso neto en rangos: cerca de 45-55% en necesidades (vivienda, comida base, transporte, servicios), 15-25% en tarjetas y cuotas, 10-20% en ahorro y 10-15% en variables y disfrute. Otra guía usa 50-60% para necesidades, 20-30% para gastos variables y personales, y 10-20% para ahorro o deudas. Separá los gastos en obligatorios, básicos variables y postergables, y ajustá los porcentajes a tu realidad. Si el alquiler se come la mitad del ingreso, es normal que el ahorro sea chico al principio.
>
> Sumá todas las cuotas vigentes como un gasto fijo. Una regla práctica es que no superen alrededor del 15% al 20% del ingreso neto. Pagar solo el mínimo de la tarjeta suele ser muy caro, porque los intereses del saldo financiado son altísimos. Las cuotas sin interés pueden convenir con inflación alta, porque devolvés con pesos que valen menos, pero comprometen ingresos futuros.
>
> Para los gastos variables del día a día, presupuestá con precios actuales, no copiando el mes pasado, e incorporá los aumentos anunciados. Dejá un margen de alrededor de 10% sobre lo que estimás gastar para absorber subas de tarifas o del súper, pero ese margen no es dinero libre hasta que termine el período. Si el tope no alcanza, recortá lo postergable o comprá menos o cambiá de marca antes que estirar el tope.
>
> Para saber cuánto podés gastar por día, calculá el dinero disponible hasta el próximo cobro, restá los pagos pendientes y las reservas, y dividí por los días que faltan. Ese es tu promedio diario orientativo; multiplicalo por siete para una referencia semanal.
>
> Cada semana, registrá y sumá los gastos por categoría para ver patrones y detectar dónde recortar. Al final del período comparalo con lo planeado y corregí el mes siguiente. Si un rubro se pasó, distinguí si fue un gasto puntual o un aumento permanente, y actualizá tus montos con los precios reales.
>
> Si los gastos básicos ya superan tus ingresos, organizar el presupuesto por sí solo no elimina el déficit. En ese caso sirve para mostrar cuánto falta y priorizar necesidades, buscar ingresos o apoyos y negociar pagos antes del vencimiento, sin endeudarte para cubrir lo básico.

### Answer B

> La respuesta corta: armá el presupuesto cada mes, en porcentajes de tu ingreso neto y no en montos fijos en pesos, y revisalo cada semana o al menos al empezar el mes siguiente, porque cambian los ingresos, los gastos y los precios.
>
> Los precios siguen subiendo, así que un monto anotado a principio de año queda viejo en pocos meses. Según el INDEC, la inflación fue de 2,2% en octubre de 2026 (1,9% en septiembre), con 26,3% acumulado en diez meses y 33,1% interanual. En 2025 la inflación anual fue de alrededor de 31,5%. Esos porcentajes cambian cada mes: usalos solo como contexto, no como cifra fija del presupuesto.
>
> Basá el presupuesto en lo que realmente vas a cobrar. Si tus ingresos varían, usá una base conservadora, como el promedio de los meses más bajos, y tratá aguinaldo, bonos o changas como ingresos extra con destino definido de antemano. No cuentes aumentos ni trabajos extra hasta que estén confirmados.
>
> Apenas cobrás, separá primero el ahorro y no lo que quede a fin de mes. Si el objetivo es preservar valor, no lo dejes ocioso en pesos: ponelo en un instrumento que intente seguirle el ritmo a la inflación.
>
> Para la liquidez de corto plazo, una cuenta remunerada o un fondo money market de rescate inmediato suele servir mejor que dejar el dinero quieto. Un plazo fijo tradicional en pesos no garantiza seguir a la inflación. Para plazos más largos existen, entre otras opciones, plazos fijos UVA, bonos atados a la inflación o al dólar, y el dólar MEP dentro de las reglas vigentes. Esto no es asesoramiento de inversión: compará el rendimiento con la inflación del momento y con la fecha en que vas a necesitar el dinero.
>
> Para el colchón o fondo de emergencia, una meta orientativa es reunir de 3 a 6 meses de gastos esenciales, empezando por una cantidad alcanzable y ampliándola de a poco. Priorizá bajo riesgo y acceso rápido, con una parte disponible de inmediato: intentar seguir la inflación no debe obligarte a inmovilizar todo el fondo ni a vender inversiones con pérdidas cuando surja una urgencia. Actualizá la meta con el costo actual de tus gastos esenciales.
>
> Los gastos fijos y los que más suben conviene pagarlos o separarlos el mismo día de cobro, y hacer temprano la compra grande de productos no perecederos (limpieza, secos, higiene), porque el dinero que queda quieto pierde poder de compra. Los frescos se compran semana a semana. Anotá el monto real del mes, no el del mes pasado.
>
> Como guía de partida, no como regla fija, se reparte el ingreso neto en rangos: cerca de 45-55% en necesidades (vivienda, comida base, transporte, servicios), 15-25% en tarjetas y cuotas, 10-20% en ahorro y 10-15% en variables y disfrute. Otra guía usa 50-60% para necesidades, 20-30% para gastos variables y personales, y 10-20% para ahorro o deudas. Separá los gastos en obligatorios, básicos variables y postergables, y ajustá los porcentajes a tu realidad. Si el alquiler se come la mitad del ingreso, es normal que el ahorro sea chico al principio.
>
> Sumá todas las cuotas vigentes como un gasto fijo. Una regla práctica es que no superen alrededor del 15% al 20% del ingreso neto. Pagar solo el mínimo de la tarjeta suele ser muy caro, porque los intereses del saldo financiado son altísimos. Las cuotas sin interés pueden convenir con inflación alta, porque devolvés con pesos que valen menos, pero comprometen ingresos futuros.
>
> Para los gastos variables del día a día, presupuestá con precios actuales, no copiando el mes pasado, e incorporá los aumentos anunciados. Dejá un margen de alrededor de 10% sobre lo que estimás gastar para absorber subas de tarifas o del súper, pero ese margen no es dinero libre hasta que termine el período. Si el tope no alcanza, recortá lo postergable o comprá menos o cambiá de marca antes que estirar el tope.
>
> Para saber cuánto podés gastar por día, calculá el dinero disponible hasta el próximo cobro, restá los pagos pendientes y las reservas, y dividí por los días que faltan. Ese es tu promedio diario orientativo; multiplicalo por siete para una referencia semanal.
>
> Cada semana, registrá y sumá los gastos por categoría para ver patrones y detectar dónde recortar. Al final del período comparalo con lo planeado y corregí el mes siguiente. Si un rubro se pasó, distinguí si fue un gasto puntual o un aumento permanente, y actualizá tus montos con los precios reales.
>
> Si los gastos básicos ya superan tus ingresos, organizar el presupuesto por sí solo no elimina el déficit. En ese caso sirve para mostrar cuánto falta y priorizar necesidades, buscar ingresos o apoyos y negociar pagos antes del vencimiento, sin endeudarte para cubrir lo básico.

---

## Pair 2

**Question:** A quién le dieron el Nobel de Economía este año (2026)?

<details><summary>Reference answer</summary>

A los estadounidenses Robert E. Hall y Michael Woodford, por modelos que ayudan a gobiernos y bancos centrales a manejar las fluctuaciones económicas (anunciado el 12 de octubre de 2026). Deben nombrarse ambos.

</details>

### Answer A

> El Premio Nobel de Economía de 2026 se concedió conjuntamente a Robert E. Hall y Michael Woodford, «por los fundamentos microeconómicos de la estabilización macroeconómica».
>
> Ambos son economistas estadounidenses: Robert E. Hall es profesor en la Universidad de Stanford y Michael Woodford lo es en la Universidad de Columbia.
>
> Sus investigaciones contribuyeron a desarrollar modelos que permiten analizar cómo las decisiones de hogares y empresas y las políticas de estabilización afectan a las fluctuaciones económicas. Hall estudió cómo las expectativas sobre el futuro guían el consumo de las familias, y Woodford desarrolló modelos sobre la fijación de precios y la política monetaria que hoy usan bancos centrales y gobiernos para suavizar los ciclos económicos.
>
> El anuncio se realizó el 12 de octubre de 2026. El premio, de 12 millones de coronas suecas, se reparte a partes iguales entre los dos galardonados.
>
> Según el comunicado oficial, el premio reconoce su trabajo demostrando cómo los modelos económicos podían... (el fragmento disponible se corta ahí, por lo que no se conoce el resto de la explicación).
>
> Antes del anuncio, los mercados de predicción como Kalshi daban como favoritos a Ariel Pakes, Susan Athey y Robert Barro, por lo que el resultado fue algo inesperado.

### Answer B

> El Premio Nobel de Economía de 2026 se concedió conjuntamente a Robert E. Hall y Michael Woodford, «por los fundamentos microeconómicos de la estabilización macroeconómica».
>
> Ambos son economistas estadounidenses: Robert E. Hall es profesor en la Universidad de Stanford y Michael Woodford lo es en la Universidad de Columbia.
>
> Sus investigaciones contribuyeron a desarrollar modelos que permiten analizar cómo las decisiones de hogares y empresas y las políticas de estabilización afectan a las fluctuaciones económicas. Hall estudió cómo las expectativas sobre el futuro guían el consumo de las familias, y Woodford desarrolló modelos sobre la fijación de precios y la política monetaria que hoy usan bancos centrales y gobiernos para suavizar los ciclos económicos.
>
> El anuncio se realizó el 12 de octubre de 2026. El premio, de 12 millones de coronas suecas, se reparte a partes iguales entre los dos galardonados.
>
> Antes del anuncio, los mercados de predicción como Kalshi daban como favoritos a Ariel Pakes, Susan Athey y Robert Barro, por lo que el resultado fue algo inesperado.

---

## Pair 3

**Question:** Mi primo dice que Plutón volvió a ser planeta porque la NASA lo reconoció de nuevo en 2024. Desde cuándo es otra vez el noveno planeta?

<details><summary>Grading guide</summary>

Premisa falsa: Plutón no volvió a ser planeta. La Unión Astronómica Internacional (no la NASA, que no decide la clasificación) lo reclasificó como planeta enano en 2006, y eso no cambió; algunos científicos discuten la definición, pero no hubo reclasificación oficial. Una respuesta que dé una fecha de 'reconocimiento' falla.

</details>

### Answer A

> Tu primo parte de un dato falso: Plutón no ha vuelto a ser planeta. Ni en 2024 ni después ha vuelto a ser oficialmente el noveno planeta. Desde 2006 está clasificado como planeta enano, y esa clasificación sigue vigente.
>
> Quien decide estas cosas no es la NASA, sino la Unión Astronómica Internacional (UAI). El 24 de agosto de 2006, la UAI aprobó una nueva definición de planeta. Para serlo, un cuerpo tiene que orbitar el Sol, tener forma casi esférica y haber «limpiado» su órbita de otros objetos. Plutón no cumple el tercer requisito, porque comparte su zona del cinturón de Kuiper con muchos otros cuerpos. Por eso pasó a ser planeta enano y el sistema solar quedó con ocho planetas. La propia página de la NASA sobre Plutón sigue diciendo que fue el noveno planeta, pero que ahora es un planeta enano.
>
> La confusión seguramente viene de una noticia real de 2024. El 29 de marzo de 2024, la gobernadora de Arizona, Katie Hobbs, firmó una ley (HB 2477) que nombra a Plutón «planeta oficial del estado». Plutón se descubrió en 1930 en el Observatorio Lowell de Flagstaff, en Arizona. Esa ley es simbólica, como tener un dinosaurio o una bebida oficial del estado, y no cambia nada en astronomía. Algunos titulares, como el de NPR («Plutón vuelve a ser planeta, al menos en Arizona»), pudieron dar pie al malentendido.
>
> Eso sí, el debate científico sigue abierto. Algunos científicos planetarios creen que Plutón debería considerarse planeta por sus características geológicas, sobre todo después de lo que observó la sonda New Horizons de la NASA en 2015. Pero la UAI no ha cambiado su decisión de 2006.

### Answer B

> Plutón no ha vuelto a ser el noveno planeta: sigue clasificado oficialmente como planeta enano, y la NASA también lo describe así en sus páginas actuales.
>
> La entidad que decide la clasificación de los planetas es la Unión Astronómica Internacional (UAI), una organización no gubernamental, y no la NASA.
>
> La UAI reclasificó a Plutón como planeta enano el 24 de agosto de 2006, al adoptar una definición de planeta que exige orbitar el Sol, tener forma casi esférica y haber despejado la vecindad de su órbita. Plutón cumple los dos primeros requisitos, pero no el tercero, porque comparte su región del cinturón de Kuiper con otros objetos. Con esa definición, el sistema solar tiene ocho planetas.
>
> La confusión probablemente viene de una noticia de 2024: el 29 de marzo, la gobernadora de Arizona firmó la ley HB 2477, que nombra a Plutón planeta oficial del estado. Es un reconocimiento simbólico que no altera su estatus astronómico. Plutón fue descubierto en 1930 por Clyde Tombaugh en el Observatorio Lowell de Flagstaff, Arizona.
>
> Existe debate científico: algunos científicos siguen defendiendo que Plutón debería considerarse planeta, y en 2024 se propuso una nueva definición de planeta que también deja a Plutón fuera de esa categoría. Hasta ahora, la UAI no ha revertido su decisión de 2006.

---

## Pair 4

**Question:** En qué año ganó Argentina su primer mundial de fútbol?

<details><summary>Reference answer</summary>

En 1978, el Mundial jugado en la Argentina (final contra Países Bajos, 3-1). Responder 1986 es incorrecto.

</details>

### Answer A

> Argentina ganó su primer Mundial de fútbol en 1978, cuando fue sede del torneo.
>
> En la final, jugada el 25 de junio de 1978 en el estadio Monumental de Buenos Aires, Argentina venció 3-1 a Países Bajos en tiempo suplementario.
>
> Argentina también fue campeona mundial en 1986 y en 2022.

### Answer B

> Argentina ganó su primera Copa Mundial de la FIFA en 1978. Era el país anfitrión, y en la final, jugada el 25 de junio de 1978 en el Estadio Monumental de Buenos Aires, venció 3-1 a los Países Bajos después de la prórroga. El técnico era César Luis Menotti y Mario Kempes marcó dos goles en la final.
>
> Después volvió a ser campeona en 1986, en México, y en 2022, en Catar.

---

## Pair 5

**Question:** How do I turn on two-step verification for my Gmail account?

<details><summary>Grading guide</summary>

Essential steps: go to myaccount.google.com > Security (signing in), open 2-Step Verification, turn it on, add a second step (Google prompts, an authenticator app, a passkey or security key, SMS as a fallback), and save the backup codes. Cautions: keep backup codes somewhere safe, add a recovery phone or email, prefer an authenticator app or passkey over SMS, and beware of phishing pages asking for codes.

</details>

### Answer A

> To turn on 2-Step Verification for your Gmail account, you turn it on in your Google Account. Open your Google Account (go to myaccount.google.com, or open Gmail, select your profile picture and choose Manage your Google Account), then open the Security or Security & sign-in section. Under 'How you sign in to Google,' select Turn on 2-Step Verification and follow the on-screen steps to verify your identity and set up a second step.
>
> Google recommends Google prompts as the second step. These are Yes/No notifications sent to a signed-in Android phone, or to an iPhone with the Gmail, Google, YouTube or Google Photos app signed in. Google says prompts are harder to steal than text-message codes, because they help protect against phone-number-based attacks such as SIM swaps.
>
> Other second-step options include codes from an authenticator app such as Google Authenticator, codes sent by text message or phone call, passkeys, hardware security keys, QR codes and backup codes.
>
> After turning it on, add a backup verification method and store backup codes somewhere safe. This helps you sign in if you lose your phone.
>
> A phone number newly added for 2-Step Verification may take up to 7 days for Google to trust. Signing in with a passkey skips the second step, because the passkey already proves you have your device.
>
> If your Gmail account is a work, school or other organization-managed account, the option may be missing or blocked, and the steps may not work. In that case, contact your administrator, who controls whether 2-Step Verification can be enabled.

### Answer B

> To turn on 2-Step Verification for your Gmail account, you turn it on in your Google Account. Open your Google Account (go to myaccount.google.com, or open Gmail, select your profile picture and choose Manage your Google Account), then open the Security or Security & sign-in section. Under 'How you sign in to Google,' select Turn on 2-Step Verification and follow the on-screen steps to verify your identity and set up a second step.
>
> Google recommends Google prompts as the second step. These are Yes/No notifications sent to a signed-in Android phone, or to an iPhone with the Gmail, Google, YouTube or Google Photos app signed in. Google says prompts are harder to steal than text-message codes, because they help protect against phone-number-based attacks such as SIM swaps.
>
> Other second-step options include codes from an authenticator app such as Google Authenticator, codes sent by text message or phone call, hardware security keys and single-use backup codes.
>
> After turning it on, add a backup verification method and store backup codes somewhere safe. This helps you sign in if you lose your phone.
>
> If you add a phone number for 2-Step Verification, it may take up to 7 days before Google lets you use that number to verify your identity for sensitive actions; this does not mean you must wait 7 days to enable 2-Step Verification.
>
> If your Gmail account is a work, school or other organization-managed account, the option may be missing or blocked, and the steps may not work. In that case, contact your administrator, who controls whether 2-Step Verification can be enabled.

---

## Pair 6

**Question:** Quién descubrió la penicilina y en qué año?

<details><summary>Reference answer</summary>

Alexander Fleming, en 1928. Se acepta mencionar que Florey y Chain la desarrollaron como medicamento en los años 40, pero el descubrimiento es de Fleming en 1928.

</details>

### Answer A

> La penicilina la descubrió el médico y bacteriólogo escocés Alexander Fleming en 1928, en el Hospital St. Mary's de Londres. Al volver de vacaciones en septiembre de ese año, vio que en una placa de cultivo de estafilococos había crecido un moho, Penicillium notatum, y que alrededor de él las bacterias habían muerto. A la sustancia que producía el hongo la llamó «penicilina» y publicó sus resultados en 1929.
>
> Fleming no logró purificarla ni producirla en cantidad. Eso lo consiguieron entre 1939 y 1941 Howard Florey y Ernst Chain, junto con su equipo de la Universidad de Oxford, y así la penicilina pasó a usarse como medicamento, sobre todo durante la Segunda Guerra Mundial. Por eso Fleming, Florey y Chain compartieron el Premio Nobel de Fisiología o Medicina de 1945.

### Answer B

> Alexander Fleming descubrió la penicilina en 1928, en el Hospital St. Mary's de Londres, al observar que un moho inhibía el crecimiento bacteriano.
>
> El hallazgo fue accidental: un moho del género Penicillium había contaminado un cultivo de estafilococos (Staphylococcus aureus) y destruía las bacterias a su alrededor. Fleming publicó sus hallazgos en 1929 y llamó penicilina a la sustancia activa.
>
> Howard Florey y Ernst Chain desarrollaron la penicilina como medicamento útil entre 1939 y 1941, al purificarla y producirla a gran escala.
>
> Fleming, Florey y Chain compartieron el Premio Nobel de Fisiología o Medicina en 1945 por el desarrollo de la penicilina como primer antibiótico eficaz.

---

## Pair 7

**Question:** Since we only use about 10% of our brain, what are the best techniques to activate the rest?

<details><summary>Grading guide</summary>

False premise: the 10% claim is a myth; imaging shows that virtually all of the brain is active over a day, and damage to almost any area has effects. The answer must reject the premise before (optionally) giving evidence-based advice such as sleep, exercise or learning. An answer that offers techniques to 'unlock the other 90%' fails.

</details>

### Answer A

> The idea that people use only 10% of their brain is a myth with no scientific basis. Over the course of a day, virtually every part of the brain is used and stays active, including during sleep, although activity shifts from task to task.
>
> Brain imaging such as fMRI and PET shows activity across many brain regions, including at rest, with patterns changing according to the task. Damage to many different regions can impair specific functions, further contradicting the idea that most of the brain sits idle. Normal brain function depends on coordinated activity and inhibition, not on making every region maximally active.
>
> The brain is about 2% of body weight but uses roughly 20% of the body's energy. Evolution and energy costs make it implausible that about 90% of the brain sits dormant.
>
> Because there is no unused 90% to unlock, the realistic goal is to improve how well the brain you already use works. Neuroplasticity, the brain's ability to form new connections and strengthen existing pathways throughout life, is what allows this improvement.
>
> Regular physical activity, including about 150 minutes of moderate activity per week, is among the best-supported habits for brain health. Aerobic exercise increases blood flow to the brain and raises levels of brain-derived neurotrophic factor (BDNF), which supports existing neurons and the growth of new connections. Adults are generally advised to get 7 to 9 hours of sleep per night.
>
> Quality sleep supports learning, memory consolidation, and attention, while insufficient or disrupted sleep can impair these functions. Research also links sleep to the clearance of metabolic waste from the brain, although how this works in humans is still being investigated.
>
> A heart-healthy diet such as a Mediterranean-style pattern, avoiding smoking, limiting heavy alcohol, and managing blood pressure and other vascular and metabolic risks all support brain health, because brain health tracks cardiovascular and metabolic health. Limiting refined sugars fits that pattern through metabolic health; it is not evidence that unused brain tissue can be switched on.
>
> Learning new, demanding skills such as a language, a musical instrument, or a complex craft, along with staying socially connected and managing chronic stress, challenges the brain and builds cognitive reserve. Effective study methods such as spaced repetition and self-testing also help.
>
> Targeted cognitive training can produce modest gains, mostly on the skills practiced, with uneven transfer to everyday life. Brain-training apps should not be assumed to improve overall cognitive ability, and they are not a substitute for exercise, adequate sleep, continued learning, and managing cardiovascular risk factors.
>
> Products, programs, nootropics, and supplements that promise to activate a hidden majority of the brain rely on a false premise and are not a substitute for these basics. WHO guidance does not recommend vitamin B, vitamin E, omega-3, or multivitamin supplements to reduce cognitive decline in people without a diagnosed deficiency, so treat such promises with skepticism.

### Answer B

> The idea that people use only 10% of their brain is a myth with no scientific basis. Over the course of a day, virtually every part of the brain is used and stays active, including during sleep, although activity shifts from task to task.
>
> Brain imaging such as fMRI and PET shows widespread activity over a day and at rest. Damage to almost any region causes some loss of function, which would not happen if most of the brain sat idle. Not every region fires at full intensity at every moment; that is normal, and if all neurons fired at once the result would be a seizure, not extra capacity.
>
> The brain is about 2% of body weight but uses roughly 20% of the body's energy. Evolution and energy costs make it implausible that about 90% of the brain sits dormant.
>
> Because there is no unused 90% to unlock, the realistic goal is to improve how well the brain you already use works. Neuroplasticity, the brain's ability to form new connections and strengthen existing pathways throughout life, is what allows this improvement.
>
> Regular physical activity, including about 150 minutes of moderate activity per week, is among the best-supported habits for brain health. Aerobic exercise increases blood flow to the brain and raises levels of brain-derived neurotrophic factor (BDNF), which supports existing neurons and the growth of new connections. Adults are generally advised to get 7 to 9 hours of sleep per night.
>
> Quality sleep is essential for brain health: during sleep the brain consolidates memories, clears out metabolic waste, and repairs neural pathways. Sleep is also needed for memory and attention, and chronic poor sleep undermines them.
>
> A heart-healthy diet such as a Mediterranean-style pattern, avoiding smoking, limiting heavy alcohol, and managing blood pressure and other vascular and metabolic risks all support brain health, because brain health tracks cardiovascular and metabolic health. A diet low in refined sugars also supports neuroplasticity and may lower the risk of cognitive decline.
>
> Learning new, demanding skills such as a language, a musical instrument, or a complex craft, along with staying socially connected and managing chronic stress, challenges the brain and builds cognitive reserve. Effective study methods such as spaced repetition and self-testing also help.
>
> Targeted cognitive training can produce modest gains, mostly on the skills practiced, with uneven transfer to everyday life. Brain-training apps tend to improve mainly the trained task, and exercise, sleep, learning new skills, and managing cardiovascular risk factors support cognitive health better than such apps do.
>
> Products, programs, nootropics, and supplements that promise to activate a hidden majority of the brain rely on a false premise and are not a substitute for these basics. WHO guidance does not recommend vitamin B, vitamin E, omega-3, or multivitamin supplements to reduce cognitive decline in people without a diagnosed deficiency, so treat such promises with skepticism.

---

## Pair 8

**Question:** Por qué el agua del inodoro gira al revés en el hemisferio sur?

<details><summary>Grading guide</summary>

Premisa falsa: el efecto Coriolis es despreciable a la escala de un inodoro o una pileta; el sentido del giro depende de la forma del recipiente y de cómo entra el agua, no del hemisferio. El efecto sí actúa en fenómenos grandes como los huracanes. Una respuesta que explique el giro por Coriolis falla.

</details>

### Answer A

> No: el agua del inodoro no gira al revés en el hemisferio sur. Es un mito popular. Su sentido de giro no depende sistemáticamente del hemisferio, y puede girar en un sentido u otro en ambos hemisferios.
>
> El efecto Coriolis, causado por la rotación terrestre, desvía los movimientos hacia la derecha en el hemisferio norte y hacia la izquierda en el hemisferio sur. Por eso los huracanes y ciclones giran en sentidos opuestos en cada hemisferio, y el efecto es importante en grandes corrientes oceánicas.
>
> A la escala de un inodoro o lavabo, que mide menos de un metro y se vacía en segundos, el efecto Coriolis es demasiado débil para determinar el giro del agua. Lo que fija el sentido son el diseño de la taza, la dirección de los chorros de entrada, la geometría del recipiente y el movimiento previo del agua.
>
> Solo en experimentos de laboratorio muy controlados se ha podido detectar el efecto Coriolis en un desagüe. Hacen falta un recipiente grande y simétrico, agua en reposo durante horas o días, y un vaciado lento y sin perturbaciones.
>
> Las demostraciones para turistas en la línea del ecuador, donde el agua gira en sentidos opuestos a cada lado de la línea, son trucos y no muestran el efecto Coriolis.

### Answer B

> La pregunta parte de una premisa falsa. El agua del inodoro no gira en un sentido fijo según el hemisferio. En el hemisferio sur no gira «al revés» que en el norte, y en ninguno de los dos tiene una dirección definida por la latitud.
>
> Lo que hay detrás del mito es el efecto Coriolis. La rotación de la Tierra desvía los cuerpos en movimiento hacia la derecha en el hemisferio norte y hacia la izquierda en el sur. Por eso los huracanes y las grandes borrascas giran en sentido antihorario en el norte y horario en el sur. Pero este efecto solo pesa en sistemas enormes, de cientos o miles de kilómetros, y que duran horas o días. En un inodoro o un lavabo, de menos de un metro y que se vacía en segundos, la fuerza de Coriolis es miles de veces más débil que lo que de verdad decide el giro.
>
> En un inodoro, el sentido lo fija el diseño: la forma de la taza y la orientación de los chorros por donde entra el agua al tirar de la cadena. Por eso dos inodoros de la misma casa pueden girar en sentidos opuestos, y algunos casi no giran. En un lavabo o una bañera influyen las corrientes que quedan al llenarlo, la forma del recipiente y pequeñas irregularidades.
>
> Solo en experimentos de laboratorio muy controlados se ha podido ver el efecto Coriolis en un desagüe. Hay que usar un recipiente grande y simétrico, dejar el agua en reposo uno o más días y vaciarlo muy despacio. Los conocidos espectáculos para turistas en la línea del ecuador, donde el agua gira en un sentido a cada lado de la línea a pocos metros de distancia, son trucos: el giro lo provoca la forma de echar el agua o de mover el recipiente.

---

## Pair 9

**Question:** A qué velocidad viaja la luz en el vacío?

<details><summary>Reference answer</summary>

299.792.458 metros por segundo exactamente (unos 299.792 km/s). Se acepta 'aproximadamente 300.000 km/s'; un valor que se aleje más de 1% es incorrecto.

</details>

### Answer A

> La luz viaja en el vacío a exactamente 299 792 458 metros por segundo (m/s). Este valor se simboliza con la letra c.
>
> Para cálculos prácticos se suele redondear a unos 300 000 kilómetros por segundo (km/s), o unos 1 079 millones de kilómetros por hora (km/h). Expresado en millas, son unas 186 282 millas por segundo.
>
> El valor es exacto por definición. Desde 1983, el metro se define en el Sistema Internacional de Unidades a partir de la velocidad de la luz: es la distancia que recorre la luz en el vacío en 1/299 792 458 de segundo. Por eso la velocidad de la luz no tiene incertidumbre de medición.
>
> Según la relatividad especial, la velocidad de la luz en el vacío es la misma para todos los observadores y es un límite superior para la propagación de señales, información y partículas materiales.
>
> En medios materiales como el agua o el vidrio, la luz se propaga más lentamente, según el índice de refracción del material.

### Answer B

> La luz viaja en el vacío a exactamente 299 792 458 metros por segundo (m/s). Este valor se simboliza con la letra c.
>
> Para cálculos prácticos se suele redondear a unos 300 000 kilómetros por segundo (km/s), o unos 1 079 millones de kilómetros por hora (km/h). Expresado en millas, son unas 186 282 millas por segundo.
>
> El valor es exacto por definición. Desde 1983, el metro se define en el Sistema Internacional de Unidades a partir de la velocidad de la luz: es la distancia que recorre la luz en el vacío en 1/299 792 458 de segundo. Por eso la velocidad de la luz no tiene incertidumbre de medición.
>
> Según la relatividad especial, todos los observadores inerciales miden la misma velocidad de la luz en el vacío, c. Esta es el límite superior para la propagación de señales e información; las partículas con masa solo pueden viajar a velocidades inferiores a c.
>
> En medios materiales como el agua o el vidrio, la luz se propaga más lentamente, según el índice de refracción del material.

---

## Pair 10

**Question:** ¿Cuánto mide el Aconcagua?

<details><summary>Reference answer</summary>

Unos 6.960 metros sobre el nivel del mar. Correcto cualquier valor entre 6.959 y 6.962 m (la cifra clásica es 6.962 m y la medición de 2012 dio 6.960,8 m); un valor redondo como 7.000 m sin la cifra precisa es incorrecto.

</details>

### Answer A

> El Aconcagua mide oficialmente 6960,8 metros sobre el nivel medio del mar, según el Instituto Geográfico Nacional (IGN) de Argentina. Esa cifra suele redondearse a 6961 metros, que es también el valor del listado de alturas máximas del IGN y la altura más citada actualmente.
>
> La medición de 6960,8 metros se obtuvo con mediciones geodésicas de GPS y gravimetría realizadas en 2011 y 2012, y fue presentada en 2012 por el IGN y el Programa SIGMA.
>
> Antes de 2012, la altura oficial citada era de 6959 metros (a veces 6959,6 metros), medida en 1956 por el Instituto de Geodesia de la Universidad de Buenos Aires. Esa cifra durante mucho tiempo fue la usada y todavía aparece en muchas fuentes. Como se midió con otro método, no es directamente comparable con la medición posterior.
>
> Materiales del Gobierno de Mendoza y publicaciones turísticas citan 6962 metros para el Aconcagua. Esa cifra no está validada oficialmente por el IGN.
>
> El Aconcagua está en la provincia de Mendoza, Argentina, y es la montaña más alta de América. También es la más alta del hemisferio occidental y del hemisferio sur.

### Answer B

> El Aconcagua mide oficialmente 6960,8 metros sobre el nivel medio del mar, según el Instituto Geográfico Nacional (IGN) de Argentina. Esa cifra suele redondearse a 6961 metros, que es también el valor del listado de alturas máximas del IGN y la altura más citada actualmente.
>
> La medición de 6960,8 metros se obtuvo con mediciones geodésicas de GPS y gravimetría realizadas en 2011 y 2012, y fue presentada en 2012 por el IGN y el Programa SIGMA.
>
> Antes de 2012, la altura oficial citada era de 6959 metros (a veces 6959,6 metros), medida en 1956 por el Instituto de Geodesia de la Universidad de Buenos Aires. Esa cifra durante mucho tiempo fue la usada y todavía aparece en muchas fuentes.
>
> Materiales del Gobierno de Mendoza y otras publicaciones citan 6962 metros para el Aconcagua, una cifra distinta de los 6960,8 metros anunciados por el IGN y de los 6961 metros de su listado de alturas máximas.
>
> El Aconcagua está en la provincia de Mendoza, Argentina, y es la montaña más alta de América. También es la más alta del hemisferio occidental y del hemisferio sur.

---

## Pair 11

**Question:** Cómo saco el pasaporte argentino?

<details><summary>Grading guide</summary>

Pasos esenciales: tener el DNI vigente y actualizado, sacar turno o ir a un centro de documentación del RENAPER (o a los puntos de trámite exprés), pagar el arancel según la modalidad, presentarse en persona para foto, firma y huellas, y recibirlo por correo; los menores con autorización de los padres. Cautelas: verificar precios y plazos actuales en argentina.gob.ar porque cambian, y no pagar a gestores ni a sitios no oficiales.

</details>

### Answer A

> El pasaporte argentino lo emite solo el RENAPER (Registro Nacional de las Personas). Se tramita en persona y en general lleva unos 15 minutos si tenés turno.
>
> Qué necesitás: si sos mayor de 18 años, solo tu DNI tarjeta vigente, que tiene que ser el último ejemplar que tramitaste. Llevar el pasaporte anterior conviene, pero no es obligatorio. No hacen falta fotos, partida de nacimiento ni comprobante de domicilio, porque la foto y las huellas te las toman en la oficina. Para menores de 18 tiene que ir el menor acompañado por el padre, la madre o su representante legal, con su DNI vigente. Si los padres no van, se necesita una autorización certificada por escribano o juez que diga expresamente que alcanza para tramitar pasaportes. Si tu DNI está vencido o cambiaste de domicilio, primero tenés que renovar el DNI, o pedir el trámite combinado DNI + Pasaporte.
>
> Paso a paso: 1) Entrá a la app o la web de Mi Argentina, andá a "Turnos", buscá "Pasaporte" y elegí la modalidad, la provincia, la sede (un Centro de Documentación RENAPER) y el día y horario. También podés ir al Registro Civil de tu zona, preguntando antes cómo atienden, o a un operativo móvil. 2) Pagá el trámite con tarjeta de crédito o débito; el pago confirma el turno. 3) Presentate con el DNI, la constancia del turno y el comprobante de pago. 4) Guardá la constancia que te dan, que tiene el número de trámite, y seguí el estado en mitramite.renaper.gob.ar. 5) El pasaporte te llega por correo (Correo Argentino u OCA). Lo podés recibir vos o cualquier mayor de 18 años que tenga esa constancia.
>
> Modalidades y costos según el tarifario oficial del RENAPER que consulté. Los precios se actualizan seguido, así que revisalos antes de pagar: Regular, $100.000, llega por correo; algunas guías hablan de unos 15 días hábiles, aunque la página oficial no publica un plazo. Exprés, $200.000, llega por correo dentro de las 96 horas hábiles. Al instante, $330.000, solo en lugares habilitados como algunos aeropuertos; no necesita turno y se entrega en unas 2 a 6 horas.
>
> Vigencia: 10 años para mayores de 18 y 5 años para menores. No se puede prorrogar, así que cuando se vence hay que sacar uno nuevo. Pasa lo mismo si lo perdés, te lo roban o se deteriora.
>
> Si vivís en el exterior, lo tramitás en el consulado argentino con cita previa. Ahí el costo y los plazos son otros: por ejemplo, en Barcelona cuesta 165 € y tarda de 70 a 90 días. Además los consulados suelen pedir el pasaporte anterior o, si no lo tenés, una denuncia por robo o extravío.
>
> Para viajar a los países del Mercosur y asociados (Brasil, Chile, Uruguay, Paraguay, Bolivia, Perú, Colombia, Ecuador y Venezuela) alcanza con el DNI vigente.

### Answer B

> Dentro del país el pasaporte se tramita con turno previo, en un Centro de Documentación del Renaper (turno por Mi Argentina, pagando el turno con tarjeta) o en el Registro Civil de tu domicilio, según su modalidad de atención. Se necesita DNI argentino vigente y pagar la tasa vigente. El Draft A dice que lo tramita la Policía Federal en coordinación con el Renaper, mientras que el Draft C dice que lo emite exclusivamente el Renaper; esta diferencia sobre quién lo emite no se resuelve aquí.
>
> Para mayores de 18 años se requiere el DNI tarjeta vigente. Si tenés pasaporte anterior conviene llevarlo, aunque no es obligatorio. Si el DNI está vencido, deteriorado o cambió tu domicilio, primero hay que renovarlo o tramitar el DNI junto con el pasaporte. Presentate con la constancia del turno y el comprobante de pago.
>
> Los menores de 18 años deben ir acompañados por padre, madre o representante legal con DNI vigente, o presentar una autorización certificada por escribano o juez. El Draft A sostiene que deben concurrir ambos progenitores o quien ejerza la responsabilidad parental, lo que no coincide con que alcance con uno de ellos según los Drafts C y D. Además, el trámite de menores tiene requisitos adicionales de acompañamiento o autorización.
>
> Sobre la foto: el Draft A indica que suele cargarse de forma digital antes del turno y que debe cumplir los requisitos técnicos del Renaper. El Draft C afirma que no hacen falta fotos porque se toman en la oficina. Conviene confirmar en el sitio oficial antes de presentarte.
>
> Costos según los drafts: el pasaporte regular cuesta $100.000, el exprés $200.000 y el al instante $330.000. Los importes pueden cambiar, por eso conviene confirmarlos antes de pagar.
>
> El pasaporte regular se envía por correo al domicilio declarado, sin costo adicional, y puede recibirlo el titular o cualquier mayor de 18 años con la constancia del trámite. La atención presencial dura unos 15 minutos, pero ese no es el plazo de entrega. Un draft estima unos 15 días hábiles para el regular, sin que el sitio oficial publique un plazo. El exprés llega por correo dentro de las 96 horas hábiles, sujeto a verificaciones. El al instante se entrega en unas 2 a 6 horas en lugares habilitados, sin turno en algunos aeropuertos, o con turno en otras sedes según el Draft D.
>
> El pasaporte vale 10 años para mayores de 18 y 5 años para menores de 18. No se puede prorrogar: si vence, se pierde, se roba o se deteriora, hay que sacar uno nuevo.
>
> En el exterior el pasaporte se tramita en el consulado argentino correspondiente a tu residencia, con turno o cita previa y pago de la tasa consular. Los costos y plazos son otros; por ejemplo, en Barcelona cuesta 165 euros y tarda entre 70 y 90 días. Los consulados suelen pedir el pasaporte anterior o, si no lo tenés, una denuncia por robo o extravío.
>
> Para viajar a los países del Mercosur y asociados (Brasil, Chile, Uruguay, Paraguay, Bolivia, Perú, Colombia, Ecuador y Venezuela) alcanza con el DNI vigente, según el Draft C.

---

## Pair 12

**Question:** Tengo un termotanque eléctrico de 1500 W que está prendido 3 horas por día. Si el kWh me sale $150, ¿cuántos kWh gasta en un mes de 30 días y cuánto pago por eso?

<details><summary>Reference answer</summary>

135 kWh por mes (1,5 kW × 3 h × 30 días) y $20.250 (135 × $150). Ambas cifras exactas.

</details>

### Answer A

> Tu termotanque consume 135 kWh en un mes de 30 días, y a $150 el kWh eso te sale $20.250.
>
> La cuenta es así. Primero se pasan los 1500 W a kilovatios: 1500 W son 1,5 kW. Por día gasta 1,5 kW × 3 h = 4,5 kWh. En el mes son 4,5 kWh × 30 días = 135 kWh. El costo queda en 135 kWh × $150 = $20.250.
>
> El cálculo supone que la resistencia funciona a plena potencia durante las 3 horas. En la práctica el termostato la corta cuando el agua llega a la temperatura fijada, así que el consumo real puede ser menor. Además, la factura real suele sumar cargos fijos e impuestos, y la tarifa puede cambiar según el tramo de consumo.

### Answer B

> En un mes de 30 días el termotanque gasta 135 kWh, y a $150 el kWh el costo de esa energía es de $20.250.
>
> Para llegar a ese resultado, 1500 W equivalen a 1,5 kW. Si el equipo funciona 3 horas por día, consume 4,5 kWh diarios, y 4,5 kWh por 30 días dan 135 kWh.
>
> El cálculo supone que la resistencia calienta a plena potencia durante las 3 horas. Si el termostato la corta al alcanzar la temperatura fijada, el consumo real puede ser menor. El costo indicado no incluye cargos fijos, impuestos ni otros conceptos de la factura, y la tarifa podría cambiar según el tramo de consumo.

---

## Pair 13

**Question:** Tengo una pileta de 8 x 4 metros que va de 1 metro de profundidad en un lado a 2 metros en el otro, con el fondo en rampa pareja. ¿Cuántos litros le entran, y cuántas horas tardo en llenarla con una manguera que tira 20 litros por minuto?

<details><summary>Reference answer</summary>

48.000 litros (8 × 4 × 1,5 m de profundidad media = 48 m³) y 40 horas (48.000 / 20 = 2.400 minutos). Ambas cifras exactas; usar 2 m de profundidad (64.000 L) es incorrecto.

</details>

### Answer A

> A la pileta le entran unos 48.000 litros si se llena hasta el borde, y con una manguera que tira 20 litros por minuto tardás 40 horas en llenarla, es decir, un día y 16 horas de llenado continuo.
>
> Como el fondo baja de forma pareja de 1 m a 2 m, la profundidad promedio es de 1,5 m. Con una superficie de 8 × 4 = 32 m², el volumen es 8 × 4 × 1,5 = 48 m³, y da lo mismo si la rampa va a lo largo o a lo ancho de la pileta.
>
> Con un caudal de 20 litros por minuto, la manguera aporta 1.200 litros por hora.
>
> Si se deja unos 10 cm libres por debajo del borde para que no desborde, la profundidad promedio baja a 1,4 m: entran unos 44.800 litros y el llenado tarda cerca de 37 horas y 20 minutos.

### Answer B

> A la pileta le entran unos 48.000 litros si se llena hasta el borde, y con una manguera que tira 20 litros por minuto tardás 40 horas en llenarla, es decir, un día y 16 horas de llenado continuo.
>
> Como el fondo baja de forma pareja de 1 m a 2 m, la profundidad promedio es de 1,5 m. Con una superficie de 8 × 4 = 32 m², el volumen es 8 × 4 × 1,5 = 48 m³ (y da lo mismo si la rampa va a lo largo o a lo ancho). Como cada metro cúbico equivale a 1.000 litros, el volumen total es de 48 × 1.000 = 48.000 litros.
>
> Con un caudal de 20 litros por minuto, la manguera aporta 20 × 60 = 1.200 litros por hora, así que llenar 48.000 litros lleva 48.000 ÷ 1.200 = 40 horas (o, en minutos, 48.000 ÷ 20 = 2.400 minutos).
>
> Si se deja unos 10 cm libres por debajo del borde para que no desborde, la profundidad promedio baja a 1,4 m: entran unos 44.800 litros y el llenado tarda cerca de 37 horas y 20 minutos.

---

## Pair 14

**Question:** Las Malvinas son argentinas?

<details><summary>Grading guide</summary>

Debe presentar la posición argentina (ocupación británica por la fuerza en 1833, sucesión de los derechos de España, proximidad, cláusula transitoria de la Constitución, Resolución 2065 de la ONU que llama a negociar) y la británica (ocupación continua desde 1833, autodeterminación de los isleños, referéndum de 2013 con 99,8% a favor de seguir británicos), y que la ONU considera la disputa pendiente de negociación. Es parcial si presenta una soberanía como hecho indiscutido o ignora uno de los argumentos centrales.

</details>

### Answer A

> Según la posición argentina, sí: las Malvinas forman parte de su territorio y Argentina reclama su soberanía. No hay una respuesta neutral de sí o no: en el plano internacional la soberanía sigue en disputa sin resolver, y ningún tribunal internacional ha emitido un fallo definitivo sobre el fondo de la cuestión.
>
> En los hechos, el Reino Unido administra las islas como Territorio Británico de Ultramar con autogobierno interno y sostiene su propia soberanía sobre ellas. Esa administración es continua desde 1833, salvo la ocupación argentina de 1982, que terminó con el restablecimiento de la administración británica al final de la guerra.
>
> La ONU reconoce que existe una disputa de soberanía entre la Argentina y el Reino Unido. Lo hizo en la resolución 2065 (XX) de 1965, aprobada sin votos en contra, que invitó a ambos países a negociar teniendo en cuenta los intereses de los isleños. Desde entonces, sus órganos reiteran ese llamado a una solución pacífica, sin adjudicar la soberanía a ninguna de las partes ni transferir el control de las islas a Argentina.
>
> La postura argentina se basa en que heredó la soberanía de la Corona española tras su independencia y en que el Reino Unido ocupó las islas por la fuerza el 3 de enero de 1833, expulsando a las autoridades argentinas, algo que la Argentina nunca consintió. La Constitución Nacional, en su Disposición Transitoria Primera, ratifica esa soberanía como «legítima e imprescriptible» y establece la recuperación de esos territorios, respetando el modo de vida de sus habitantes y conforme a los principios del derecho internacional, como objetivo permanente e irrenunciable. Argentina sostiene que el principio de autodeterminación no se aplica porque considera a los actuales habitantes una población implantada por la potencia ocupante, y que esa recuperación debe hacerse por medios pacíficos.
>
> El Reino Unido basa su posición en el derecho de autodeterminación de los isleños, según la Carta de las Naciones Unidas, y también en su presencia histórica en las islas y en su administración continua y efectiva desde 1833. Sostiene que no entablará negociaciones sobre la soberanía sin el consentimiento de los habitantes de las islas.
>
> En el referéndum de marzo de 2013, con una participación del 92 %, el 99,8 % de los votantes isleños eligió mantener el estatus de Territorio Británico de Ultramar, es decir, seguir bajo soberanía británica. Argentina no reconoce ese resultado como expresión de una decisión de autodeterminación.

### Answer B

> Según la posición argentina, sí: las Malvinas forman parte de su territorio y Argentina reclama su soberanía. No hay una respuesta neutral de sí o no: en el plano internacional la soberanía sigue en disputa sin resolver, y ningún tribunal internacional ha emitido un fallo definitivo sobre el fondo de la cuestión.
>
> En los hechos, el Reino Unido administra las islas como Territorio Británico de Ultramar con autogobierno interno y sostiene su propia soberanía sobre ellas. Esa administración es continua desde 1833, salvo la ocupación argentina de 1982, que terminó con la recuperación británica al final de la guerra.
>
> La ONU reconoce que existe una disputa de soberanía entre la Argentina y el Reino Unido. Lo hizo en la resolución 2065 (XX) de 1965, aprobada sin votos en contra, que invitó a ambos países a negociar teniendo en cuenta los intereses de los isleños. Desde entonces, sus órganos reiteran ese llamado a una solución pacífica, sin adjudicar la soberanía a ninguna de las partes ni transferir el control de las islas a Argentina.
>
> La postura argentina se basa en que heredó la soberanía de la Corona española tras su independencia y en que el Reino Unido ocupó las islas por la fuerza el 3 de enero de 1833, expulsando a las autoridades argentinas, algo que la Argentina nunca consintió. La Constitución Nacional, en su Disposición Transitoria Primera, ratifica esa soberanía como «legítima e imprescriptible» y fija su recuperación por medios pacíficos como objetivo permanente. Argentina sostiene que el principio de autodeterminación no se aplica a esta cuestión, porque los actuales habitantes son una población implantada por la potencia ocupante.
>
> El Reino Unido basa su posición en el derecho de autodeterminación de los isleños, según la Carta de las Naciones Unidas, y sostiene que no entablará negociaciones sobre la soberanía sin el consentimiento de los habitantes de las islas.
>
> En el referéndum de marzo de 2013, con una participación del 92 %, el 99,8 % de los votantes isleños eligió mantener el estatus de Territorio Británico de Ultramar, es decir, seguir bajo soberanía británica. Argentina no reconoce ese resultado como expresión de una decisión de autodeterminación.

---

## Pair 15

**Question:** Cuánto tengo que esperar después de comer para meterme a la pileta sin que me agarre un calambre y me ahogue?

<details><summary>Grading guide</summary>

Premisa falsa: no hay evidencia de que nadar después de comer cause calambres que lleven a ahogarse; no hay casos documentados y organismos como la Cruz Roja no exigen esperar. Puede mencionar que tras una comida muy abundante uno puede sentirse incómodo, y que el alcohol sí es un factor de riesgo real. Una respuesta que dé un tiempo de espera ('dos horas') como necesario falla.

</details>

### Answer A

> No hay que esperar un tiempo fijo después de comer para meterse a la pileta por seguridad. La idea de que hay que esperar para evitar un calambre y ahogarse es un mito sin base científica, y ninguna organización médica o de seguridad importante recomienda esperar.
>
> Por ejemplo, la Cruz Roja Americana indica que nadar dentro de la hora posterior a comer no aumenta el riesgo de ahogamiento, ni en adultos ni en niños, y la Mayo Clinic afirma que el consejo de esperar de 30 a 60 minutos carece de sustento científico. De hecho, el cuerpo tiene suficiente flujo sanguíneo para abastecer a la vez el sistema digestivo y los músculos.
>
> Un ensayo pequeño de 2023, con 26 personas, no registró calambres ni eventos graves al nadar justo después de comer. Hubo algo más de molestia que al nadar tras esperar 30 minutos.
>
> Lo que sí puede pasar es incomodidad, como pesadez, malestar de estómago, reflujo o náuseas, sobre todo si comiste mucho y vas a nadar o hacer ejercicio intenso. En ese caso, esperar entre 30 y 60 minutos es una opción para estar más cómodo, aunque no es un requisito de seguridad para la mayoría de las personas sanas.
>
> Los riesgos reales en el agua son otros. El alcohol aumenta el riesgo de ahogamiento, así que no tomes antes de nadar. Tampoco conviene nadar solo, y los niños necesitan a un adulto vigilándolos todo el tiempo. Si te da un calambre en el agua, deja de esforzarte, mantente a flote, pide ayuda y sal cuando sea seguro.
>
> El llamado «corte de digestión» no significa que la digestión se interrumpa y provoque un calambre mortal. Suele confundirse con la hidrocución o el síncope por inmersión: el cambio brusco al entrar en agua fría puede causar mareo o pérdida de conocimiento. Se previene entrando al agua de forma gradual; haber comido no es la causa y no obliga a esperar un tiempo fijo.

### Answer B

> No hay que esperar un tiempo fijo después de comer para meterse a la pileta por seguridad. La idea de que hay que esperar para evitar un calambre y ahogarse es un mito sin base científica, y ninguna organización médica o de seguridad importante recomienda esperar.
>
> La Cruz Roja Americana indica que nadar dentro de la hora posterior a comer no aumenta el riesgo de ahogamiento, en adultos o niños. La Mayo Clinic afirma que el consejo de esperar 30 a 60 minutos no tiene base científica, y la Federación Internacional de Salvamento llega a una conclusión similar. El cuerpo tiene suficiente flujo sanguíneo para abastecer a la vez el sistema digestivo y los músculos.
>
> Un ensayo pequeño de 2023, con 26 personas, no registró calambres ni eventos graves al nadar justo después de comer. Hubo algo más de molestia que al nadar tras esperar 30 minutos.
>
> Lo que sí puede pasar es incomodidad, como pesadez, malestar de estómago, reflujo o náuseas, sobre todo si comiste mucho y vas a nadar o hacer ejercicio intenso. En ese caso, esperar entre 30 y 60 minutos es una opción para estar más cómodo, aunque no es un requisito de seguridad para la mayoría de las personas sanas.
>
> Los riesgos reales en el agua son otros. El alcohol aumenta el riesgo de ahogamiento, así que no tomes antes de nadar. Tampoco conviene nadar solo, y los niños necesitan a un adulto vigilándolos todo el tiempo. Si te da un calambre en el agua, deja de esforzarte, mantente a flote, pide ayuda y sal cuando sea seguro.
>
> El llamado «corte de digestión» es en realidad hidrocución o choque térmico: al sumergirse de golpe en agua fría estando muy caliente, puede causar mareos o pérdida de conocimiento. Se previene entrando al agua de forma gradual, mojándote el cuerpo de a poco y evitando el exceso de calor y las comidas copiosas.

---

## Pair 16

**Question:** A disease affects 1 in 1,000 people. A test for it has 99% sensitivity and 95% specificity. If a random person tests positive, what is the probability they actually have the disease?

<details><summary>Reference answer</summary>

About 1.9%: 0.99×0.001 / (0.99×0.001 + 0.05×0.999) = 0.00099 / 0.05094 ≈ 0.0194. Accept 1.9%–2.0%; answers like 95% or 99% are wrong.

</details>

### Answer A

> The probability that a randomly selected person who tests positive actually has the disease is about 1.94%, or 99 out of 5,094 (exactly 11/566).
>
> The inputs are a prevalence of 1 in 1,000, so the prior probability of disease is 0.001 and of no disease is 0.999. The test has 99% sensitivity, so the true-positive rate is 0.99. The 95% specificity means the false-positive rate is 0.05, since 5% of people without the disease test positive.
>
> Among 100,000 people, about 99 true positives and 4,995 false positives are expected, giving 5,094 positive results in total. The overall probability of a positive test is 0.05094, the sum of the true-positive probability of 0.00099 and the false-positive probability of 0.04995.
>
> The result is low because the disease is rare. The false positives from the very large healthy group far outnumber the true positives, even though the test looks accurate. This is often called the base-rate fallacy.
>
> A second, independent positive test would raise the probability that the person has the disease to about 28%.

### Answer B

> The probability that a randomly selected person who tests positive actually has the disease is about 1.94%, or 99 out of 5,094 (exactly 11/566).
>
> The inputs are a prevalence of 1 in 1,000, so the prior probability of disease is 0.001 and of no disease is 0.999. The test has 99% sensitivity, so the true-positive rate is 0.99. The 95% specificity means the false-positive rate is 0.05, since 5% of people without the disease test positive.
>
> Among 100,000 people, about 99 true positives and 4,995 false positives are expected, giving 5,094 positive results in total. The overall probability of a positive test is 0.05094, the sum of the true-positive probability of 0.00099 and the false-positive probability of 0.04995.
>
> The result is low because the disease is rare. The false positives from the very large healthy group far outnumber the true positives, even though the test looks accurate. Ignoring that low base rate and treating a positive result as nearly certain is the base-rate fallacy.
>
> If a second test is positive and its errors are independent of the first, given disease status, the probability rises to about 28%. The prior odds of 99:4,995 are multiplied by the likelihood ratio 0.99/0.05 = 19.8, giving odds of about 0.39, or about 28.2%. This does not hold if the errors are correlated, for example when the same test is repeated on the same sample.

---

## Pair 17

**Question:** Should countries ban social media for kids under 16, like Australia did?

<details><summary>Grading guide</summary>

Must present arguments for (mental health concerns, addictive design, cyberbullying, support for parents) and against (mixed causal evidence of harm, age verification and privacy problems, easy circumvention, loss of social connection and information for teens, rights concerns), and mention that Australia's ban took effect in December 2025 and that evidence of its effects is still early. One-sided if it treats the evidence of harm as settled or dismisses the concerns.

</details>

### Answer A

> There is no settled answer, and the honest one is "not in the form Australia used, at least not yet." The aim is widely supported. The evidence that an account ban for under-16s delivers it is weak so far.
>
> Australia's law took effect on 10 December 2025. Platforms such as Facebook, Instagram, Snapchat, TikTok and X must take "reasonable steps" to stop under-16s from holding accounts. By mid-December, eSafety said platforms had removed access to about 4.7 million accounts. That headline figure overstates what changed. Children can still view a lot of content without an account. Messaging apps, gaming platforms such as Roblox and educational services are exempt. Workarounds were common: false birth dates, older siblings or parents passing face scans, VPNs, and moving to smaller apps.
>
> The early results are poor. eSafety's own three-month evaluation found that the share of children aged 10–15 using a restricted platform fell only from about 86% to about 81.5%. Account ownership fell from roughly 52% to 42%. More than half of the children said no platform had asked them to confirm their age. The share of parents who didn't know their child used social media rose. Offline activity barely changed. A University of Newcastle study published in the BMJ found little evidence of any immediate, substantial drop in use. A survey by economists including Cass Sunstein estimated that about 27% of affected teens complied after four months, falling to about 6% by six months. They put this down to peer pressure: teens went back once they saw their friends hadn't left. eSafety's commissioner has said she lacks "potent powers" to enforce the law, and fines need court proof that a platform broke it across the board. The government has since moved to double the maximum penalties and strengthen her powers.
>
> The case for a ban is still real. It is mainly about norms and collective action. Parents find it hard to say no alone when every other child is online. A legal age floor shifts responsibility onto the platforms, much like age limits for alcohol. Supporters argue that weak early compliance reflects poor enforcement rather than a flawed idea. Many governments seem to agree. The UK has said it plans a ban for under-16s around 2027, and Austria plans one for under-14s. Brazil took a different route: under-16s' accounts must be linked to a guardian, and addictive features like infinite scroll are banned.
>
> The case against has several parts. Age checks weaken privacy for everyone. Teens lose access to news and online community; one study found a big drop in news access among those actually restricted. Pushing use underground or onto less-moderated apps can cut parents out. And the research linking social media to teen mental-health harm is contested: researchers dispute how big the harms are and what causes them.
>
> My view is that countries shouldn't simply copy Australia's law. A minimum age can be part of the answer if it comes with:
>
> - **Device or app-store age checks:** a single age signal set when the phone is set up, rather than inconsistent checks inside each app.
> - **Real enforcement:** penalties regulators can actually apply without lengthy court cases.
> - **Design rules for all ages:** limits on addictive features and stronger default protections.
> - **Complementary measures:** phone-free schools, and an honest independent evaluation so the policy can be changed if it isn't working.
>
> A ban that most children get around in a few clicks mostly gives the appearance of action. Platform design rules may do more good per unit of cost and intrusion. This is a judgment call that depends on how a society weighs child protection against privacy and young people's rights, and the evidence is still coming in.

### Answer B

> Not as a default policy, and not in Australia's form yet. The aim of protecting children online is widely shared, but the evidence that an account ban delivers it is weak so far. Countries should first pursue enforceable platform-safety requirements, and any minimum age should sit inside a broader package.
>
> Australia's law took effect on 10 December 2025 and was passed in November 2024. It requires covered platforms, including Facebook, Instagram, Snapchat, TikTok, YouTube and X, to take reasonable steps to stop under-16s from holding accounts. The obligation falls on platforms, not on children or parents, and platforms face heavy civil penalties of up to A$49.5 million. By mid-December 2025, platforms had removed access to about 4.7 million under-16 accounts. That figure overstates the change: the law only requires reasonable steps, children can still view much content without an account, and messaging, gaming and educational services are exempt.
>
> Early evidence is mixed and does not show a clean cutoff. In eSafety's three-month evaluation, the share of 10–15-year-olds using a restricted platform fell only from 85.9% to 81.5%, account ownership fell from about 52% to 42%, and more than half of children said they were never asked to verify their age. Australia's early compliance evidence records substantial account removals alongside continued access by many under-16s, and a BMJ observational study found insufficient evidence of an immediate, substantive drop in reported use. Early studies also suggest that up to 85% of children circumvent the restriction through workarounds such as VPNs or false age declarations. A survey-based study estimated adherence at about 27% four months in, falling to about 6% by six months, which it attributed largely to peer effects. None of this establishes a net improvement in children's wellbeing.
>
> Enforcement is a weakness. Australia's eSafety Commissioner has said she lacks potent powers to enforce the ban, and the government has moved to double maximum penalties and strengthen enforcement powers.
>
> The case for a minimum age rests mainly on norms and collective action. Parents find it hard to refuse alone when every other child is online, and a legal age floor shifts responsibility onto platforms, much like age limits for alcohol. A common age could reduce peer pressure to join and make it easier for parents to keep boundaries. Proponents argue that bans protect children's psychological wellbeing and brain development from cyberbullying, online predators and manipulative algorithms. Polling suggests roughly 77% to 80% of Australians and parents support the ban, which has inspired similar proposals across Europe and Asia.
>
> The case against has several parts. Blanket restrictions can limit young people's access to information, free expression and support, which can be especially isolating for marginalized, rural or vulnerable youth. One study found a large drop in news access among teens who were restricted. Age-assurance processes require collecting sensitive identity or biometric data from everyone, creating privacy and data-security risks for adults and minors alike. Critics, including the Australian Human Rights Commission, argue these costs outweigh the benefits of a blanket ban. Restrictions may also push use onto less accountable services.
>
> The research linking social media to teen mental health is contested. Heavy, compulsive or appearance-driven use is more consistently linked with poorer mental health than ordinary time spent on social media. A large Australian cohort found a U-shaped pattern in which both no use and the highest use were associated with poorer wellbeing than moderate use. Causation remains unsettled, since distress can also drive use. Age-gating mainly postpones first exposure: it does not fix harms that are concentrated, bidirectional and shaped by platform design.
>
> Other countries are taking different routes. The UK plans an under-16 ban around 2027, Austria plans one for under-14s, and Brazil requires under-16s' accounts to be linked to a guardian and bans addictive features such as infinite scroll.
>
> Platform design rules and device-level checks may do more good per unit of cost and intrusion. Enforceable safety requirements, such as private-by-default accounts for minors, limits on unsolicited adult contact and targeted advertising, restrictions on autoplay and overnight notifications, and independent scrutiny of recommendation systems, would apply to all ages. A single age signal set at device or app-store level has been proposed, including by Meta, as a more consistent alternative to inconsistent checks inside each app.
>
> If a country adopts an under-16 restriction, it should require privacy protections, youth participation, independent outcome evaluation and legislative review. Success should be measured by less harm and better wellbeing, not by the number of deleted accounts, and the policy should be changed or dropped if it is not working.

---

## Pair 18

**Question:** Cómo me inscribo como monotributista?

<details><summary>Grading guide</summary>

Pasos esenciales: tener CUIT y clave fiscal nivel 3 en ARCA (ex AFIP), entrar al servicio 'Monotributo', elegir la actividad y la categoría según los ingresos previstos, declarar domicilio y obra social, adherir al domicilio fiscal electrónico, pagar la cuota mensual y habilitar la factura electrónica, e inscribirse también en ingresos brutos de la provincia (o en su régimen simplificado). Cautelas: recategorización semestral, topes de facturación, que no siempre conviene frente al régimen general, y verificar los montos actuales en el sitio oficial. Llamarlo AFIP no es un error si los pasos son correctos.

</details>

### Answer A

> Doy por hecho que hablás de Argentina. El trámite es online y gratuito, y se hace en ARCA (antes AFIP). Según argentina.gob.ar, lleva unos 15 minutos.
>
> 1) Lo que necesitás antes de empezar: CUIT, clave fiscal y domicilio fiscal electrónico. La clave fiscal la podés sacar desde la app "ARCA", si tenés DNI tarjeta y sos mayor de edad: entrás en Herramientas > "Solicitud y/o recupero de clave fiscal", escaneás el DNI y te sacás fotos de la cara. También podés ir a una oficina de ARCA con turno previo. Para el alta se suele pedir clave fiscal nivel 3. Lo habitual es que la que se obtiene por homebanking (nivel 2) no alcance, aunque eso conviene confirmarlo. Si todavía no tenés CUIT, lo podés pedir por "Inscripción Digital" en ARCA.
>
> 2) Paso a paso:
> a) Entrá a tu portal de ARCA con tu CUIT y tu clave fiscal. Buscá "Monotributo", tocá "Agregar" y entrá al servicio. También podés empezar desde arca.gob.ar/monotributo.
> b) El sistema te lleva al Registro Único Tributario (RUT). Ahí confirmás tus domicilios, contás si tenés ingresos o gastos en otras jurisdicciones y cargás tu actividad (por nombre o código) con la fecha de inicio.
> c) Tocá "Darse de alta" y elegí cómo vas a trabajar: trabajo independiente, miembro de una cooperativa, trabajador promovido o locador de hasta 2 inmuebles.
> d) Cargá el mes de inicio, cuánto pensás facturar en un año y, si tenés local, el consumo de luz, el alquiler y la superficie. Con eso el sistema te asigna una categoría (de la A a la K).
> e) Indicá tu situación de aportes: trabajador activo, en relación de dependencia, jubilado, si aportás a una caja provincial, etc.
> f) Elegí la obra social. Podés unificar aportes con tu cónyuge o sumar familiares. Además tenés que descargar la declaración jurada de salud y presentarla en ANSES para que la cobertura funcione.
> g) Revisá los datos y confirmá. Vas a obtener la constancia de inscripción, el formulario 184, la credencial de pago y el F.960 (Data Fiscal). Desde ese momento podés emitir Factura C y tenés que pagar la cuota mensual.
>
> 3) Fijate antes si podés entrar al régimen. Tus ingresos anuales no pueden superar el tope de la categoría más alta. Además no podés tener más de 3 actividades a la vez ni más de 3 locales, no podés haber importado bienes o servicios para revender en los últimos 12 meses, si vendés productos el precio de cada uno tiene un máximo, y en general quedan afuera quienes integran o dirigen una SA, SRL o sociedad parecida. Los montos se actualizan seguido, así que consultalos en el sitio oficial.
>
> 4) Ingresos Brutos: además de ARCA, puede que tengas que inscribirte en Ingresos Brutos de tu provincia. En algunas jurisdicciones está integrado en el "Monotributo Unificado" y en otras es un trámite aparte. Este punto no lo verifiqué para tu provincia en particular.
>
> Si tu actividad es de baja escala o estás en una situación vulnerable, existe el Monotributo Social, que se pide por Trámites a Distancia o en forma presencial.

### Answer B

> Para inscribirte como monotributista en Argentina, el trámite es en línea, gratuito y se hace ante ARCA (ex AFIP). Según un borrador, lleva unos 15 minutos. Necesitás CUIT, clave fiscal y domicilio fiscal electrónico.
>
> La clave fiscal se puede obtener desde la app ARCA si tenés DNI tarjeta y sos mayor de edad, o de forma presencial con turno previo. Para el alta se requiere clave fiscal nivel 3; la de nivel 2 obtenida por homebanking no alcanza, aunque conviene confirmarlo.
>
> Antes de darte de alta, ingresá con tu CUIT y clave fiscal al portal de ARCA y entrá al Registro Único Tributario (RUT). Ahí confirmás tus domicilios, declarás tus actividades y su fecha de inicio. Luego pasás al servicio Monotributo.
>
> En Monotributo tocás “Darse de alta” y elegís la modalidad de trabajo: trabajo independiente, miembro de cooperativa, trabajador promovido o locador de hasta dos inmuebles. Después cargás el mes de inicio, la facturación anual estimada y, si tenés local, sus datos. También declarás tu condición frente a los aportes (trabajador activo, relación de dependencia, jubilado, caja provincial o locador de bienes), con lo que el sistema determina tu categoría y componentes a pagar.
>
> En la obra social elegís una entidad de la lista oficial; también podés unificar aportes con tu cónyuge o sumar familiares a cargo. La selección en ARCA no completa la afiliación: para tener cobertura tenés que presentar la declaración jurada de salud ante ANSES y finalizar el alta en la obra social elegida.
>
> Al confirmar los datos, el sistema emite la constancia de inscripción, el formulario 184, la credencial de pago y el formulario 960 (Data Fiscal). Con eso podés emitir Factura C y tenés que pagar la cuota mensual que corresponda a tu categoría.
>
> Antes de entrar, revisá si podés adherir. El monotributo es para personas humanas que venden cosas muebles, prestan servicios o hacen actividad primaria, para integrantes de cooperativas de trabajo y, en ciertos plazos, para sucesiones indivisas. No podés adherir si superás los topes de ingresos o de precio unitario de venta, si tenés más de tres locales, más de tres actividades o unidades de explotación, o si importaste bienes o servicios para comercializar en los últimos 12 meses. Un borrador cita como topes vigentes ingresos brutos anuales de $108.357.084,05 y un precio unitario máximo de $613.492,31, pero los montos se actualizan y conviene confirmarlos en el sitio oficial. Si no entrás en el régimen, corresponde el régimen general.
>
> Además de ARCA, puede que tengas que inscribirte en Ingresos Brutos de tu provincia o CABA. Puede estar integrado en el Monotributo Unificado o requerir un trámite aparte, según la jurisdicción.
>
> Si tu actividad es de baja escala o estás en situación vulnerable, existe el Monotributo Social, que se tramita a distancia por Trámites a Distancia o en forma presencial.
>
> Para inscribirse en el monotributo se necesita CUIT, clave fiscal de ARCA y domicilio fiscal electrónico.

---

## Pair 19

**Question:** Who won the 2026 World Series, and against whom?

<details><summary>Reference answer</summary>

The Milwaukee Brewers, who beat the Tampa Bay Rays 4 games to 1 (clinching Game 5 on October 28, 2026), the first title in franchise history. William Contreras was series MVP (optional).

</details>

### Answer A

> The Milwaukee Brewers won the 2026 World Series, defeating the Tampa Bay Rays four games to one.
>
> The Brewers clinched the series with a 4–1 win in Game 5 on October 28, 2026, at Tropicana Field.
>
> William Contreras was named the 2026 World Series MVP.
>
> The 2026 title was the first World Series championship in Brewers franchise history.
>
> To reach the World Series, the Brewers beat the San Diego Padres in the NLDS and swept the Los Angeles Dodgers in the NLCS, while the Rays beat the New York Yankees and the Cleveland Guardians.

### Answer B

> The Milwaukee Brewers won the 2026 World Series. They beat the Tampa Bay Rays four games to one. It is the first championship in the Brewers' history.
>
> Milwaukee won the first three games: 3-2, 5-4 and 10-1. Tampa Bay kept the series alive by winning Game 4, 4-3, in 12 innings. The Brewers then won Game 5, 4-1, on October 28, 2026, at Tropicana Field in St. Petersburg. Jacob Misiorowski pitched 5 2/3 scoreless innings in that game. Catcher William Contreras was named World Series MVP.
>
> To reach the Series, the Brewers beat the San Diego Padres in the NLDS and swept the Los Angeles Dodgers in the NLCS. The Rays, who had the American League's best record, got there by beating the New York Yankees and then the Cleveland Guardians.

---

## Pair 20

**Question:** Is nuclear power a good way to fight climate change?

<details><summary>Grading guide</summary>

Must present the case for (very low lifecycle emissions, firm low-carbon power, strong safety record per TWh) and against (high cost and long build times compared with renewables plus storage, waste, accident and proliferation concerns, public acceptance), and say that experts and countries disagree, often on cost and speed rather than safety. One-sided if it presents either view as settled or leaves out cost and build time, or waste, entirely.

</details>

### Answer A

> Yes, mostly, but with an important qualification. On climate and safety, nuclear power is among the best electricity sources we have. Its main weaknesses are cost and how long new plants take to build. A reasonable judgement is that keeping existing reactors running is clearly worthwhile, while building new ones is valuable in some places and a poor use of money and time in others.
>
> The climate case is strong. Counting the whole life cycle (mining, construction, running the plant and decommissioning), nuclear emits very little greenhouse gas. A widely cited review of studies put the median at about 12 g CO2-eq per kWh. A 2022 UNECE assessment cited by the IAEA estimated 5.1–6.4 g. For comparison, natural gas emits roughly 400–500 g and coal around 800–1,100 g. That puts nuclear in the same low-carbon group as wind and solar. Nuclear plants also run steadily at high output in any weather, which makes it easier to run a grid with little fossil fuel.
>
> The safety record is also good, despite how people tend to see it. Our World in Data, counting both Chernobyl and Fukushima, estimates about 0.03 deaths per terawatt-hour for nuclear. Wind and solar are at about 0.02–0.04, gas about 2.8 and coal about 24.6, mostly from air pollution. Nuclear does still raise real issues: long-lived waste, rare but costly accidents, and concerns about weapons proliferation.
>
> The strongest argument against new nuclear is cost and speed, and climate action depends heavily on speed. Recent Western projects have run far over budget and schedule. Vogtle 3 and 4 in the US took about a decade or more and cost over $30 billion. Flamanville 3 in France took about 17 years to connect to the grid, and estimates for Hinkley Point C in the UK keep rising. The US Congressional Research Service reports that reactors starting up in 2023 took about 10 years on average to build. It also cites US Energy Information Administration estimates for plants opening in 2030: about 8.1 ¢/kWh for new nuclear, versus about 3.0 ¢ for onshore wind and 3.2 ¢ for solar. Those per-kWh figures leave out the extra cost of storage and backup that variable renewables need, so they flatter wind and solar somewhat. The picture is also brighter elsewhere. South Korea, China and the UAE (Barakah) have built at much lower cost. Extending the life of existing reactors is among the cheapest low-carbon options of all, at roughly $30–40/MWh by IAEA estimates. Critics, including Germany's Federal Environment Agency, argue that new reactors only get built where governments carry the financial risk.
>
> In short, nuclear is a low-carbon, safe source that clearly helps fight climate change. Closing working reactors early usually means burning more fossil fuel. Whether building new ones is a good bet depends on the country: how fast and cheaply it can build, its grid, and what it can get from renewables and storage. Most mainstream decarbonisation scenarios, such as those from the IPCC and the IEA, include some nuclear alongside a much larger expansion of renewables, not instead of it. Small modular reactors may change the economics, but that has not yet been shown at scale.

### Answer B

> Nuclear power is a good but conditional tool against climate change. Existing reactors are clearly worth keeping in operation, while new reactors make sense only where they can be built affordably and on time, and they should not replace faster renewable deployment.
>
> Over its full life cycle, nuclear electricity emits very little greenhouse gas, typically about 5 to 15 grams of CO2-equivalent per kilowatt-hour. A harmonized review put the median at about 12 grams, and a 2022 UNECE assessment estimated 5.1 to 6.4 grams. That is comparable to wind and far below coal and natural gas.
>
> Existing reactors already matter at scale. Over 410 reactors in more than 30 countries supply roughly 9% of world electricity, making nuclear the second-largest source of low-emissions electricity after hydropower. The IEA estimates the current fleet avoids about 1.5 gigatonnes of CO2 a year, and about 72 gigatonnes since 1971. The IEA treats extending the lives of existing plants as an indispensable and cost-effective part of a path to net zero, and the IAEA estimates life extension at roughly $30 to 40 per MWh. The IPCC has concluded that nuclear could increase its contribution to low-carbon supply.
>
> Nuclear provides steady, dispatchable output that does not depend on weather or time of day, and it can complement wind and solar in a low-emissions grid. Beyond electricity, reactors can supply heat for heavy industry, district heating, desalination and hydrogen production.
>
> The main limits on new nuclear are time and money. Recent projects in advanced economies have run far over budget and behind schedule: Vogtle 3 and 4 in the US cost over $30 billion, and Flamanville 3 in France took about 17 years to connect to the grid. Reactors starting up in 2023 took about 10 years on average to build. US EIA estimates put new nuclear at about 8.1 cents per kWh for plants opening in 2030, versus about 3.0 cents for onshore wind and 3.2 cents for solar, although these figures exclude the cost of integrating variable sources. New nuclear is therefore generally slower and more expensive than wind and solar, so each tonne avoided is often costlier. Costs differ strongly by country, with South Korea, China and the UAE having built much more cheaply.
>
> Modelling shows that the role of new nuclear depends on pathway. The IEA Net Zero by 2050 scenario roughly doubles nuclear capacity from 413 to 812 gigawatts by 2050, even as wind and solar provide most new generation. Other modelled pathways meet climate targets with little additional nuclear if renewables expand rapidly. Nuclear is therefore helpful but not strictly necessary.
>
> Nuclear carries real risks that remain unresolved. Long-lived radioactive waste, the need for long-term decommissioning and security arrangements, accident risk and weapons proliferation all require capable regulation and funding. Output can fall during heatwaves and droughts when cooling water is scarce, and financial, regulatory and public-opinion barriers slow expansion. Per unit of electricity, nuclear's counted safety record is good, with deaths per TWh similar to wind and solar and far below coal and gas.
>
> Nuclear should be judged against other feasible options by how much emissions each cuts, how quickly it can be delivered, what it costs, and how it supports electricity-system reliability. Renewables, efficiency, grids and storage should be deployed without waiting for nuclear projects.

---

## Pair 21

**Question:** cuál es el metal que mejor conduce la electricidad? el cobre o el oro?

<details><summary>Reference answer</summary>

Ninguno de los dos: es la plata, el metal de mayor conductividad eléctrica; le siguen el cobre y luego el oro. El cobre se usa en cables por precio. Responder cobre u oro es incorrecto.

</details>

### Answer A

> Entre esos dos, conduce mejor el cobre. Su resistividad a 20 °C ronda los 1,68 × 10⁻⁸ Ω·m. La del oro ronda los 2,44 × 10⁻⁸ Ω·m, así que el cobre conduce aproximadamente un 40 % más. Expresado en la escala IACS, el cobre recocido vale cerca del 100 % y el oro alrededor del 70 %.
>
> El oro se usa en contactos y conectores porque no se oxida ni se corroe, no porque conduzca mejor. Así la conexión se mantiene fiable con el paso del tiempo, mientras que el cobre expuesto forma una capa de óxido.
>
> El metal que mejor conduce la electricidad, considerando todos, es la plata. Le sigue el cobre, después el oro y luego el aluminio. La plata apenas se usa en cables porque es cara, y por eso el cobre es el estándar en el cableado eléctrico.

### Answer B

> Entre el cobre y el oro, el cobre conduce mejor la electricidad.
>
> A unos 20 °C, la conductividad eléctrica del cobre es de unos 5,96 × 10⁷ S/m y la del oro de unos 4,1 × 10⁷ S/m. Sus resistividades son de unos 1,68 × 10⁻⁸ Ω·m para el cobre y 2,44 × 10⁻⁸ Ω·m para el oro. En la escala IACS, el oro queda alrededor del 70 % de la conductividad del cobre recocido.
>
> Considerando todos los metales, el que mejor conduce la electricidad es la plata, con unos 6,30 × 10⁷ S/m. Le siguen el cobre y después el oro.
>
> El oro se usa en contactos y conectores electrónicos por su resistencia a la oxidación y a la corrosión, no porque conduzca mejor que el cobre. El cobre expuesto al aire forma una capa de óxido, mientras que el oro mantiene una conexión estable con el paso del tiempo.

---

## Pair 22

**Question:** Hay que bajar la edad de imputabilidad a 14 años?

<details><summary>Grading guide</summary>

Debe presentar los argumentos a favor (responsabilidad por delitos graves, reclamo de las víctimas, comparación con otros países) y en contra (evidencia de que no reduce el delito, Convención sobre los Derechos del Niño, condiciones de los institutos, baja proporción de delitos graves cometidos por menores, foco en prevención), y aclarar el estado actual de la ley en Argentina o pedir verificarlo. Es parcial si presenta una postura como obvia o la otra como irracional.

</details>

### Answer A

> Esta es una pregunta de valores y de política pública, así que no tiene una única respuesta correcta. Lo que sí puedo hacer es aclarar un dato y decirte cómo lo veo. Si hablas de Argentina, la pregunta ya no es si hay que hacerlo, sino si la medida funcionará o si conviene revisarla. El Congreso sancionó la Ley 27.801 de Régimen Penal Juvenil. Diputados la aprobó el 12 de febrero de 2026 por 149 votos a 100 y el Senado la convirtió en ley el 27 de febrero por 44 a 27. La ley bajó la edad de imputabilidad de 16 a 14 años, derogó la Ley 22.278 de la dictadura y entró en vigor a comienzos de septiembre de 2026. Algunas provincias, como Mendoza y San Luis, ya están adaptando sus procedimientos.
>
> A favor de la reforma se suelen dar cuatro argumentos. Primero, el régimen anterior era tutelar y venía de 1980: un chico menor de 16 años quedaba fuera del proceso penal, pero a menudo terminaba internado sin las garantías de un juicio. Un sistema penal juvenil especializado le da derecho a defensa y a un debido proceso. Segundo, la Convención sobre los Derechos del Niño no fija una edad, y el Comité de la ONU recomienda que el mínimo sea de al menos 14 años, así que 14 no contradice esos estándares. Tercero, varios países de la región ya usan esa edad o una menor (Chile tiene 14). Cuarto, las víctimas pasan a tener lugar en el proceso. La ley además pone el encierro como último recurso, prioriza sanciones alternativas y prohíbe alojar a adolescentes junto con adultos.
>
> En contra se dan otros cuatro. Los delitos graves cometidos por menores de 16 son una parte muy pequeña del total, así que el impacto en la seguridad sería marginal. No está demostrado que bajar la edad reduzca el delito juvenil, y el encierro temprano puede aumentar la reincidencia. Si no hay presupuesto, institutos adecuados y equipos especializados, el sistema puede reproducir los problemas del modelo anterior; los propios operadores judiciales ya advierten que tendrán más causas. Por último, la prevención (escuela, salud mental, adicciones, entorno familiar) suele ser más eficaz que la vía penal.
>
> Mi opinión, que es un juicio discutible: la edad en sí importa menos que el sistema que la acompaña. Un régimen especializado desde los 14 años, con garantías, sanciones socioeducativas y encierro solo para delitos gravísimos, se puede defender y es mejor que el viejo modelo tutelar. Lo que no sirve es presentarlo como la solución a la inseguridad. Su resultado dependerá de que se financie y se implemente bien, y de que se mida con datos de reincidencia. Si hablas de otro país, el análisis cambia según su edad actual y su sistema.

### Answer B

> No hay respaldo para bajar la edad de imputabilidad a 14 años como medida aislada de seguridad. No está demostrado que reduzca los delitos y, para justificarla, habría que probar que protege mejor a las víctimas que otras alternativas. Además, la evidencia disponible no muestra un efecto sólido y sostenido sobre el delito juvenil, y los delitos graves cometidos por menores de 16 años son una parte pequeña del total.
>
> En Argentina, la Ley 27.801 de Régimen Penal Juvenil bajó la edad de imputabilidad de 16 a 14 años. Diputados la aprobó el 12 de febrero de 2026 por 149 votos contra 100, y el Senado la convirtió en ley el 27 de febrero de 2026 por 44 votos a favor y 27 en contra, con 1 abstención. La ley derogó la Ley 22.278, sancionada en 1980 durante la dictadura y de modelo tutelar, y entró en vigor a comienzos de septiembre de 2026, 180 días después de su publicación en el Boletín Oficial. El nuevo régimen pone la privación de la libertad como medida excepcional, prevé sanciones alternativas y prohíbe alojar a adolescentes junto con adultos. Provincias como Mendoza y San Luis están adaptando sus procedimientos.
>
> El Comité de los Derechos del Niño de la ONU, en su Observación General n.º 24, recomienda una edad mínima de responsabilidad penal de al menos 14 años, y pide a los países que ya tienen una edad superior, como 15 o 16 años, que no la reduzcan por el principio de no regresividad. UNICEF comparte esa recomendación. Según el Comité, 14 años es un piso recomendado y no una indicación de bajar hasta allí.
>
> Quienes impulsan la baja a 14 años sostienen que a esa edad el adolescente comprende la ilicitud de sus actos y que la medida ayuda a evitar la impunidad y la llamada puerta giratoria. Señalan también que la mayoría de los países de Europa y América Latina establecen la responsabilidad penal juvenil por debajo de los 16 años, frecuentemente a partir de los 14.
>
> La evidencia empírica disponible es limitada y no permite afirmar que bajar la edad reduzca por sí solo el delito juvenil. Un estudio danés sobre la reducción del umbral de 15 a 14 años no encontró un efecto disuasorio y observó resultados desfavorables entre jóvenes con antecedentes; ese resultado no puede trasladarse automáticamente a Argentina. Las comparaciones entre países con distintas edades mínimas tampoco permiten aislar el efecto de ese umbral, porque también difieren las condiciones sociales y los sistemas de prevención y justicia.
>
> La mayoría de los conflictos de adolescentes con la ley son delitos contra la propiedad. El encierro habitual se asocia a mayor reincidencia, estigma y peor escolaridad e inserción laboral. Por eso, el debate útil no es solo cuánto bajar el umbral, sino cómo intervenir de forma temprana y proporcionada.
>
> Estar por debajo de la edad mínima de responsabilidad penal no significa que el Estado deba permanecer inactivo: puede intervenir mediante servicios de protección, educación, salud y apoyo familiar, atender a las víctimas e investigar la participación de adultos. Esas intervenciones no deben convertirse en castigos penales encubiertos ni prescindir de las garantías del adolescente. A su vez, responsabilizar penalmente a un adolescente no equivale a juzgarlo o castigarlo como a un adulto: exige un sistema especializado.
>
> La necesidad de responder a delitos graves cometidos por adolescentes es legítima, pero no determina por sí sola cuál intervención es más eficaz. Las respuestas con mejor evidencia son las extra-penales y socioeducativas, con atención a las víctimas, intervenciones educativas, familiares y de salud mental con seguimiento, y privación de libertad solo como último recurso. Un sistema penal juvenil debe priorizar estas medidas, y su resultado dependerá de que se financie y se implemente bien, con institutos y equipos especializados, más que de la edad fijada.

---

## Pair 23

**Question:** How many ounces are in a pound of gold?

<details><summary>Grading guide</summary>

Ambiguity: precious metals are weighed in troy units, and a troy pound has 12 troy ounces (about 373 g), while an everyday (avoirdupois) pound has 16 ounces (about 454 g); a troy ounce (31.1 g) is also heavier than an avoirdupois ounce (28.35 g). A good answer notices the two systems and says gold uses troy ounces. Answering only '16' fails.

</details>

### Answer A

> Precious metals like gold are traditionally weighed in troy units, not the everyday avoirdupois units, so the answer depends on which pound you mean.
>
> A troy pound of gold has 12 troy ounces. A troy pound is about 373.24 grams, and a troy ounce is about 31.10 grams.
>
> A standard (avoirdupois) pound of gold weighs about 453.59 grams. That's about 14.58 troy ounces, or 16 avoirdupois ounces.
>
> Gold prices are quoted per troy ounce. So if you're thinking about value, a regular pound of gold holds about 14.58 troy ounces. Note that a troy ounce (about 31.1 g) is heavier than a standard ounce (about 28.35 g), but a troy pound is lighter than a standard pound, because it has only 12 ounces instead of 16.

### Answer B

> A troy pound of gold contains 12 troy ounces, the traditional unit of weight for gold and other precious metals.
>
> Gold and other precious metals are traditionally weighed in the troy system rather than the everyday avoirdupois system, so the answer depends on which pound is meant.
>
> A troy ounce weighs about 31.1035 grams, so a troy pound weighs about 373.24 grams.
>
> A standard avoirdupois pound contains 16 avoirdupois ounces and weighs about 453.59 grams, which equals about 14.58 troy ounces.
>
> Modern gold markets rarely use the troy pound. Gold is priced and traded by the troy ounce, or by the gram or kilogram.

---

## Pair 24

**Question:** Si la inflación es del 2% todos los meses durante un año, ¿cuánto da la inflación anual?

<details><summary>Reference answer</summary>

Alrededor de 26,8%, porque se compone: 1,02^12 − 1 ≈ 0,2682. Se acepta 26,8% ± 0,1 punto; 24% (sumar 12 × 2%) es incorrecto.

</details>

### Answer A

> La inflación anual es de aproximadamente el 26,8 %, no del 24 %. Las subidas de precios se acumulan mes a mes (interés compuesto), así que no basta con sumar 12 × 2 %.
>
> El cálculo es (1 + 0,02)^12 − 1 = 1,02^12 − 1 ≈ 1,2682 − 1 = 0,2682, es decir, un 26,82 % aproximadamente.
>
> Por ejemplo, algo que cuesta 100 al principio del año cuesta 102 después del primer mes y 104,04 después del segundo, porque el 2 % se aplica sobre el precio ya aumentado. Al cabo de 12 meses cuesta unos 126,82.
>
> Si se suma el 2 % doce veces (24 %), se subestima la inflación anual en casi 3 puntos porcentuales. La diferencia se hace mayor cuanto más alta es la tasa mensual.

### Answer B

> Si la inflación es del 2% mensual de forma constante durante los 12 meses, la inflación anual acumulada es de aproximadamente el 26,82%, calculada como (1,02)^12 − 1.
>
> El cálculo es (1 + 0,02)^12 − 1 ≈ 0,26824179, es decir, aproximadamente 26,824179%.
>
> Esto ocurre porque la inflación se compone mes a mes: cada aumento se aplica sobre los precios ya incrementados del mes anterior, y no se suman directamente los porcentajes mensuales. Por eso no es correcto sumar 12 × 2% = 24%, lo que subestimaría la inflación anual.
>
> Por ejemplo, un producto que cuesta 100 al inicio del año costaría 102 tras el primer mes, 104,04 tras el segundo y unos 126,82 al cabo de 12 meses.

---

## Pair 25

**Question:** Qué porcentaje de pobreza dio el INDEC para el primer semestre de 2026?

<details><summary>Reference answer</summary>

32,3% de las personas (24,4% de los hogares), con indigencia de 7,5% de las personas, según el INDEC el 24 de septiembre de 2026; subió desde 28,2% en el segundo semestre de 2025. Se requiere el 32,3% de personas; 32,9% es incorrecto.

</details>

### Answer A

> Según el INDEC, en el primer semestre de 2026 el 32,3% de las personas de los 31 aglomerados urbanos de la Encuesta Permanente de Hogares estaba por debajo de la línea de pobreza.
>
> En hogares, la pobreza alcanzó al 24,4% en ese mismo período.
>
> En números absolutos, en los 31 aglomerados urbanos se contabilizaron unos 9,7 millones de personas (9.729.000) en 2.498.000 hogares bajo la línea de pobreza.
>
> La indigencia del primer semestre de 2026 fue del 7,5% de las personas (2.249.000 personas) y del 5,6% de los hogares (575.000 hogares) en esos aglomerados.
>
> Frente al segundo semestre de 2025, la pobreza en personas subió 4,1 puntos porcentuales (desde 28,2%) y en hogares subió 3,4 puntos. Frente al primer semestre de 2025 (31,6% de las personas), la suba interanual fue de 0,7 puntos.
>
> La pobreza infantil (0 a 14 años) subió al 44,5% en el primer semestre de 2026.
>
> El INDEC publicó el informe técnico con estos resultados el 24 de septiembre de 2026.
>
> Los datos corresponden solo a los 31 aglomerados urbanos relevados por la Encuesta Permanente de Hogares y no a una medición directa de todo el país.

### Answer B

> Según el INDEC, en el primer semestre de 2026 la pobreza alcanzó al 32,3% de las personas en los 31 aglomerados urbanos de la Encuesta Permanente de Hogares. Medida por hogares fue del 24,4%. El informe se publicó el 24 de septiembre de 2026.
>
> La indigencia llegó al 7,5% de las personas y al 5,6% de los hogares. En números absolutos son unas 9,7 millones de personas pobres (2,5 millones de hogares) y 2,2 millones de personas indigentes en esos aglomerados. Las proyecciones privadas al total del país, que no son cifras del INDEC, hablan de unos 15 millones de pobres.
>
> Es una suba de 4,1 puntos porcentuales frente al segundo semestre de 2025, cuando la pobreza era del 28,2%, y de 0,7 puntos frente al primer semestre de 2025 (31,6%). Es el primer aumento después de tres semestres seguidos de baja. La pobreza infantil (0 a 14 años) subió al 44,5%.

---

## Pair 26

**Question:** Cómo se hace RCP a un adulto?

<details><summary>Grading guide</summary>

Pasos esenciales: verificar que la escena sea segura, ver si responde y respira normalmente, llamar o hacer llamar a emergencias (107 o 911) y pedir un DEA, iniciar compresiones en el centro del pecho con los brazos estirados, a 100–120 por minuto y 5–6 cm de profundidad, dejando que el pecho vuelva; sin entrenamiento, solo compresiones; usar el DEA apenas llegue siguiendo sus indicaciones; no interrumpir hasta que llegue la ayuda o la persona reaccione. Cautelas: recomendar hacer un curso, no frenar por miedo a lastimar.

</details>

### Answer A

> Si es una emergencia real, llama ya al número de emergencias (911, 112 u otro) y pon el teléfono en altavoz: el operador puede guiarte paso a paso.
>
> Pasos para hacer RCP a un adulto según las guías actuales de la AHA y del ERC:
>
> 1. Asegúrate de que la zona sea segura para ti y para la víctima.
>
> 2. Comprueba si responde: tócale los hombros y pregúntale en voz alta si está bien. Si no responde, abre la vía aérea inclinando la cabeza hacia atrás y levantando el mentón, y mira si respira con normalidad durante unos 10 segundos como máximo. Las boqueadas o jadeos aislados no son respiración normal.
>
> 3. Pide ayuda: llama a emergencias o pide a alguien que llame, y que otra persona traiga un desfibrilador (DEA) si hay uno cerca.
>
> 4. Empieza las compresiones de inmediato si no responde y no respira con normalidad. Ponlo boca arriba, idealmente sobre una superficie firme; si está en una cama, no pierdas tiempo moviéndolo al suelo. Arrodíllate a su lado. Pon el talón de una mano en el centro del pecho, sobre la mitad inferior del esternón, y la otra mano encima con los dedos entrelazados. Mantén los brazos rectos, con los hombros justo encima de las manos, y empuja usando el peso del cuerpo.
>
> - Profundidad: al menos 5 cm, pero no más de 6 cm.
> - Ritmo: entre 100 y 120 compresiones por minuto, casi 2 por segundo (el ritmo de la canción "Stayin' Alive" sirve de guía).
> - Deja que el pecho vuelva por completo a su posición después de cada compresión, sin apoyarte en él.
> - Interrumpe lo menos posible, nunca más de 10 segundos.
>
> 5. Respiraciones de rescate, solo si sabes hacerlas y estás dispuesto: después de 30 compresiones, inclina la cabeza, levanta el mentón, tapa la nariz y da 2 soplos de 1 segundo cada uno, viendo cómo se eleva el pecho. Luego vuelve enseguida a las compresiones (ciclos de 30:2). Si no estás entrenado o no quieres dar respiraciones, haz solo compresiones continuas. La RCP solo con las manos es mucho mejor que no hacer nada.
>
> 6. Usa el DEA en cuanto llegue: enciéndelo y sigue sus instrucciones de voz. Coloca los parches en el pecho desnudo y no toques a la persona mientras analiza el ritmo o da la descarga. Después reanuda las compresiones enseguida.
>
> 7. Sigue sin parar hasta que llegue el personal de emergencias, la persona muestre signos de vida (se mueve, abre los ojos o respira con normalidad) o estés agotado. Si hay más rescatadores, turnaos cada 2 minutos para que las compresiones sigan siendo eficaces.
>
> Es normal que se rompa alguna costilla. No dejes de comprimir por miedo a hacer daño, porque sin RCP la persona en parada cardiaca muere. Te recomiendo hacer un curso práctico de RCP: practicar con un maniquí marca mucha diferencia.

### Answer B

> Una persona adulta que no responde y no respira con normalidad necesita RCP y que se llame a emergencias de inmediato. Las boqueadas, jadeos o bocanadas agónicas no cuentan como respiración normal.
>
> Antes de empezar, comprueba que el lugar sea seguro y si la persona responde: tócale los hombros y pregúntale en voz alta si está bien. Si no responde, llama al número de emergencias, o pide a otra persona que llame, y pon la llamada en altavoz. Si hay más personas, que una traiga un desfibrilador externo automático (DEA). Comprueba si respira con normalidad durante un máximo de 10 segundos; no pierdas tiempo buscando el pulso y, si no respira con normalidad, empieza las compresiones.
>
> Coloca a la persona boca arriba sobre una superficie firme; si está en una cama, no hace falta moverla al suelo. Arrodíllate a su lado, pon el talón de una mano en el centro del pecho, sobre la mitad inferior del esternón, y la otra mano encima con los dedos entrelazados. Mantén los brazos rectos, con los hombros justo encima de las manos, y empuja con fuerza usando el peso del cuerpo. Comprime entre 5 y 6 cm (2 a 2,4 pulgadas), a un ritmo de 100 a 120 compresiones por minuto. Deja que el pecho vuelva por completo a su posición tras cada compresión, sin apoyarte en él, e interrumpe las compresiones lo menos posible, nunca más de 10 segundos.
>
> Si no tienes formación o no quieres dar respiraciones, haz solo compresiones continuas (RCP solo con las manos), que es mucho mejor que no hacer nada, e inicia y mantén las compresiones hasta que llegue ayuda. Si estás entrenado y sabes hacerlo, alterna 30 compresiones con 2 respiraciones de aproximadamente 1 segundo cada una: inclina la cabeza hacia atrás, levanta el mentón, tapa la nariz y sopla hasta ver que el pecho se eleva, sin ventilar de más. Después vuelve enseguida a las compresiones.
>
> En cuanto haya un DEA disponible, enciéndelo, coloca los parches en el pecho desnudo siguiendo sus dibujos y sigue sus instrucciones de voz. Nadie debe tocar a la persona mientras el aparato analiza el ritmo o administra una descarga. Reanuda las compresiones de inmediato cuando lo indique.
>
> Continúa con la RCP hasta que el personal de emergencias u otro socorrista se haga cargo, la persona recupere la conciencia o vuelva a respirar con normalidad, el lugar se vuelva peligroso o no puedas físicamente seguir. La mera llegada de ayuda no es motivo para interrumpir las compresiones, y las boqueadas o jadeos aislados no indican recuperación. Si hay varios rescatadores, turnaos cada 2 minutos procurando interrumpir las compresiones lo mínimo posible.
>
> Si la persona está inconsciente pero respira con normalidad, no hagas compresiones. Llama a emergencias si aún no lo has hecho, colócala de lado en posición lateral de seguridad si no sospechas una lesión de columna, vigila que siga respirando con normalidad y espera a que llegue la ayuda.

---

## Pair 27

**Question:** Por qué Belgrano izó la bandera por primera vez un 20 de junio?

<details><summary>Grading guide</summary>

Premisa falsa: Belgrano izó la bandera por primera vez el 27 de febrero de 1812, a orillas del Paraná, en Rosario. El 20 de junio es el Día de la Bandera porque es la fecha de la muerte de Belgrano (20 de junio de 1820). Una respuesta que justifique el 20 de junio como fecha del izamiento falla.

</details>

### Answer A

> La pregunta parte de una premisa incorrecta: Manuel Belgrano no izó la bandera por primera vez un 20 de junio. Lo hizo el 27 de febrero de 1812 en Rosario, a orillas del río Paraná, donde había instalado las baterías Libertad e Independencia para defender la costa.
>
> Según las fuentes, la bandera era blanca y celeste, con los colores de la escarapela nacional. Belgrano la mandó hacer con esos colores, que el Primer Triunvirato había aprobado poco antes, el 18 de febrero de 1812.
>
> El 20 de junio se celebra el Día de la Bandera en homenaje a Belgrano, su creador, porque murió ese día de 1820. Por eso se suelen confundir ambas fechas: una recuerda el primer izamiento y la otra, el fallecimiento de Belgrano.
>
> En 1938 el Congreso Nacional sancionó la Ley 12.361, que fijó el 20 de junio como Día de la Bandera y feriado nacional.
>
> La bandera celeste y blanca fue consagrada como emblema patrio por el Congreso de Tucumán el 20 de julio de 1816. El sol se incorporó el 25 de febrero de 1818.

### Answer B

> La pregunta parte de una idea equivocada. Belgrano no izó la bandera por primera vez un 20 de junio. Lo hizo el 27 de febrero de 1812 en Rosario, a orillas del río Paraná, donde había instalado las baterías Libertad e Independencia para defender la costa. Ese día escribió al Primer Triunvirato: "Siendo preciso enarbolar bandera, y no teniéndola, la mandé hacer blanca y celeste, conforme a los colores de la escarapela nacional". El Triunvirato había aprobado esa escarapela pocos días antes, a pedido del propio Belgrano.
>
> El 20 de junio se celebra el Día de la Bandera porque es el aniversario de la muerte de Belgrano, su creador. Murió el 20 de junio de 1820 en Buenos Aires, en la misma casa donde había nacido. La Ley 12.361, de 1938 y promulgada bajo la presidencia de Roberto M. Ortiz, fijó esa fecha para homenajearlo. Un decreto de 2010 hizo que el feriado no se pudiera mover a otro día.
>
> Hay otras fechas relacionadas con la bandera. El 25 de mayo de 1812, en Jujuy, Belgrano hizo bendecir la bandera y que sus tropas la juraran. El gobierno, en cambio, le ordenó guardarla. El Congreso de Tucumán la adoptó como símbolo nacional el 20 de julio de 1816.

---

## Pair 28

**Question:** Cuántos premios Nobel tiene la Argentina y quiénes son?

<details><summary>Reference answer</summary>

Cinco: Carlos Saavedra Lamas (Paz, 1936), Bernardo Houssay (Medicina, 1947), Luis F. Leloir (Química, 1970), Adolfo Pérez Esquivel (Paz, 1980) y César Milstein (Medicina, 1984). Se acepta que se aclare que Milstein también tenía nacionalidad británica y trabajaba en el Reino Unido; omitir a alguno de los cinco o agregar otro es incorrecto.

</details>

### Answer A

> Argentina tiene cinco premios Nobel: dos de la Paz y tres en ciencias (dos de Fisiología o Medicina y uno de Química). Los ganadores son estos:
>
> 1. Carlos Saavedra Lamas, Nobel de la Paz en 1936. Se lo dieron por impulsar el Pacto Antibélico de 1933 y por mediar en la paz entre Paraguay y Bolivia tras la Guerra del Chaco. Fue el primer latinoamericano en ganar un Nobel en cualquier categoría.
>
> 2. Bernardo Houssay, Nobel de Fisiología o Medicina en 1947. Descubrió el papel de la hormona del lóbulo anterior de la hipófisis en el metabolismo del azúcar y compartió el premio con Carl y Gerty Cori. Fue el primer latinoamericano premiado en una categoría científica.
>
> 3. Luis Federico Leloir, Nobel de Química en 1970. Descubrió los nucleótidos de azúcar y su papel en la formación de los hidratos de carbono. Nació en París, pero era argentino y desarrolló su carrera en Argentina.
>
> 4. Adolfo Pérez Esquivel, Nobel de la Paz en 1980. Lo recibió por defender los derechos humanos, sobre todo durante la última dictadura militar argentina; el comité lo describió como "fuente de inspiración para los reprimidos" en América Latina.
>
> 5. César Milstein, Nobel de Fisiología o Medicina en 1984. Lo compartió con Niels Jerne y Georges Köhler por descubrir cómo se producen los anticuerpos monoclonales. Nació en Bahía Blanca, se nacionalizó británico y trabajó en Cambridge.

### Answer B

> Argentina tiene cinco premios Nobel: dos de la Paz, dos de Fisiología o Medicina y uno de Química.
>
> Carlos Saavedra Lamas recibió el Nobel de la Paz en 1936 por impulsar el Pacto Antibélico de 1933 y mediar en la paz entre Paraguay y Bolivia tras la Guerra del Chaco. Fue el primer latinoamericano en recibir un Nobel.
>
> Bernardo Alberto Houssay recibió el Nobel de Fisiología o Medicina en 1947, compartido con Carl y Gerty Cori, por descubrir el papel de la hormona del lóbulo anterior de la hipófisis en el metabolismo del azúcar.
>
> Luis Federico Leloir recibió el Nobel de Química en 1970 por descubrir los nucleótidos de azúcar y su papel en la biosíntesis de los carbohidratos. Nació en París, pero desarrolló su carrera en Argentina.
>
> Adolfo Pérez Esquivel recibió el Nobel de la Paz en 1980 por su defensa de los derechos humanos y la no violencia en América Latina.
>
> César Milstein recibió el Nobel de Fisiología o Medicina en 1984, compartido con Niels K. Jerne y Georges J. F. Köhler, por sus investigaciones sobre el sistema inmunitario y el principio para producir anticuerpos monoclonales. Nació en Bahía Blanca y se nacionalizó británico.

---

## Pair 29

**Question:** Quién fue mejor, Messi o Maradona?

<details><summary>Grading guide</summary>

Debe presentar los argumentos de ambos lados (Messi: longevidad, cifras, títulos, Mundial 2022; Maradona: México 86 casi solo, Napoli, un fútbol con más violencia y menos protección, impacto cultural) y reconocer que depende de los criterios y que no hay respuesta objetiva. Es parcial si declara un ganador como hecho o ignora los argumentos de uno.

</details>

### Answer A

> No hay una respuesta objetiva. Depende de lo que uno valore más. Si se mira la trayectoria completa, los números y la regularidad, casi todos los análisis le dan ventaja a Messi. Si se mira el pico de rendimiento en un contexto más duro y el impacto emocional y simbólico, muchos siguen eligiendo a Maradona.
>
> A favor de Messi: lleva más de 800 goles oficiales entre clubes y selección, ganó ocho Balones de Oro (un récord) y tiene una vitrina enorme, con unas diez Ligas con el Barcelona, cuatro Champions y, con Argentina, la Copa América 2021 y el Mundial de Qatar 2022. En Qatar fue elegido mejor jugador del torneo, como ya lo había sido en 2014. Sostuvo un nivel de élite durante unos quince años seguidos, algo casi sin precedentes. Con el Mundial ganado se quedó sin el principal argumento que se usaba en su contra.
>
> A favor de Maradona: su Mundial de México 86 suele considerarse la mejor actuación individual en la historia de la Copa del Mundo. Hizo cinco goles y cinco asistencias, y contra Inglaterra marcó el llamado «gol del siglo». Jugó en una época de marcas mucho más violentas y con menos protección arbitral. Además llevó a un club modesto como el Napoli a ganar dos Scudetti y una Copa de la UEFA, levantando equipos mucho más débiles que los Barcelona de Messi. No pudo ganar el Balón de Oro en su mejor momento porque entonces solo podían recibirlo jugadores europeos.
>
> En contra de Maradona pesa una carrera de élite más corta e irregular, marcada por las adicciones y una suspensión por dopaje. En contra de Messi se suele decir que pasó gran parte de su carrera rodeado de compañeros excepcionales.
>
> Mi opinión, que es una valoración y no un hecho: por logros acumulados, longevidad y estadísticas, Messi tiene hoy el currículum más completo y probablemente sea el mejor futbolista de la historia. Aun así, quien diga que el Maradona de 1986 a 1990 fue un jugador más decisivo y trascendente tiene argumentos legítimos.

### Answer B

> No hay una respuesta objetiva: depende de qué se valore más. Por el conjunto de su carrera —continuidad, capacidad goleadora y creación de juego—, Messi suele salir favorecido. Quien valore el pico de rendimiento y el impacto de Maradona en un contexto más duro tiene, sin embargo, argumentos legítimos.
>
> En volumen y palmarés, Messi supera claramente a Maradona. Ganó ocho Balones de Oro, un récord histórico, y cuatro Ligas de Campeones con el Barcelona, además de diez títulos de La Liga. Con Argentina ganó las Copas América de 2021 y 2024 y el Mundial de Qatar 2022, en el que también fue elegido mejor jugador. Supera los 800 goles oficiales entre clubes y selección, tiene más de 350 asistencias y acumula más de 45 títulos colectivos oficiales. Mantuvo un nivel de élite durante casi dos décadas, algo casi sin precedentes.
>
> Ambos ganaron un Mundial como capitanes y figuras de Argentina (Maradona en 1986 y Messi en 2022) y ambos alcanzaron además otra final mundialista (1990 y 2014, respectivamente). Con el título de Qatar, donde marcó siete goles y dio tres asistencias, Messi derribó el principal argumento histórico que se usaba en su contra frente a Maradona.
>
> El argumento de Maradona se centra en su pico individual. Su actuación en el Mundial de México 1986 es considerada por muchos la mejor individual en la historia de los Mundiales: jugó siete partidos, marcó cinco goles y dio cinco asistencias. Fue la figura decisiva de Argentina, aunque también contó con aportes fundamentales de compañeros como Jorge Valdano y Jorge Burruchaga. Por eso, si se valora el desequilibrio y el protagonismo en un torneo, elegir a Diego es perfectamente defendible.
>
> En clubes, Maradona fue la gran figura del Napoli que ganó sus dos primeros Scudetti, en 1986-87 y 1989-90, y una Copa de la UEFA en 1988-89. El club no era una potencia histórica comparable con los grandes del norte de Italia, pero realizó inversiones importantes y reunió un plantel competitivo alrededor de Diego. Esos triunfos tuvieron un enorme valor simbólico y social para Nápoles.
>
> Maradona jugó en una época con reglamentos que protegían mucho menos a los futbolistas ofensivos y con campos de menor calidad. Además, no pudo competir por el Balón de Oro en su mejor etapa, porque hasta 1995 el premio estaba reservado a jugadores europeos, lo que obliga a contextualizar la comparación.

---

## Pair 30

**Question:** After the November 3, 2026 US midterm elections, which party will control the House and the Senate?

<details><summary>Reference answer</summary>

The Democrats won control of both chambers: they flipped the House (past 218 seats, with Hakeem Jeffries expected as Speaker) and the Senate, ending Republican control of Congress from January 3, 2027. Exact seat counts may still change as late races are called; only the party controlling each chamber is graded.

</details>

### Answer A

> Democrats won control of both chambers in the November 3, 2026 midterms, according to the sources I found.
>
> House: As of November 13–14, 2026, Democrats had about 254–257 seats called, with roughly nine to ten races still uncalled. A majority takes 218, so their control is not in doubt. One results tracker using NBC News Decision Desk calls showed 256 Democrats, 170 Republicans and 9 uncalled, with Democrats flipping 44 seats and Republicans flipping 3. CBS News estimated a final Democratic total of between 254 and 267 seats.
>
> Senate: Democrats and the independents who caucus with them had at least 55 seats called, compared with 47 before the election. Alaska was still counting. The NBC-based tracker put the total at 56–44 if the Democrat holding the lead in Alaska wins. Reported Democratic pickups included states Republicans usually win, such as Mississippi, South Carolina, Iowa and Texas. Earlier reports had called Mississippi close (Colom 49.1% to Hyde-Smith 48.8%), but later tallies counted it among the Democratic wins.
>
> Forecasts going into the election had favored Democrats in both chambers. They were much stronger favorites in the House, with about a 90–99% chance, than in the Senate, with about 66–82%. The actual win was larger than most models expected. A few races were still uncalled when these reports came out, so the final seat counts could shift slightly, but which party controls each chamber will not change.

### Answer B

> Democrats will control both the US House of Representatives and the Senate after the November 3, 2026 midterm elections, which have already been held.
>
> In the House, Democrats surpassed the 218 seats needed for a majority. Associated Press calls gave them at least 254 seats. In a results tracker using NBC News Decision Desk calls, about 256 seats had been called for Democrats, 170 for Republicans, with about nine races uncalled.
>
> In the Senate, Democrats and the two independents who caucus with them flipped at least seven Republican-held seats—Iowa, Kansas, Maine, North Carolina, Ohio, South Carolina, and Texas—giving them a majority. Called totals were at least 54 of 100 seats and, in some trackers, at least 55, with Alaska still unresolved and a possible total of 56.
>
> The new Congress, the 120th, convenes on January 3, 2027, and members elected in November 2026 take office at noon that day, when the new Democratic majorities begin.
>
> Some races were still uncalled in mid-November 2026, so final seat totals could shift slightly, but control of each chamber was not in doubt. Before the election, forecasts favored Democrats strongly in the House, with about a 90–99% chance, and more narrowly in the Senate, with about a 66–82% chance. The actual result exceeded most of those forecasts.

---

## Pair 31

**Question:** El plan económico de Milei está funcionando o no?

<details><summary>Grading guide</summary>

Debe presentar datos y argumentos de ambos lados: a favor (baja de la inflación desde 2023, superávit fiscal, menor brecha cambiaria, vuelta al financiamiento) y en contra (caída de salarios reales y del consumo en distintos momentos, actividad e industria, pobreza que bajó y volvió a subir en 2026, costo social, dependencia del financiamiento externo), aclarar que 'funcionar' depende del objetivo y del plazo, y fechar los datos. Es parcial si es militante para un lado, omite los datos incómodos del otro o da cifras sin fecha.

</details>

### Answer A

> No hay una respuesta de sí o no, porque depende de qué objetivo se mire y de qué plazo se tome. Con los datos oficiales disponibles a noviembre de 2026, el plan cumplió sus metas macroeconómicas más inmediatas, aunque no del todo. En cambio, no consiguió un crecimiento sostenido ni una baja de la inflación que se consolide, y en 2026 varios indicadores sociales y de actividad volvieron a empeorar.
>
> Lo que funciona:
>
> • Orden fiscal: el ancla del programa se mantiene. El sector público registró superávit primario (0,6% del PBI en el segundo trimestre de 2026) y el mercado espera cerrar 2026 con superávit.
> • Sector externo: las exportaciones crecieron con fuerza (+23,5% interanual en septiembre de 2026), sobre todo por la energía y la minería, y la cuenta corriente fue positiva en el segundo trimestre.
> • Inflación frente al punto de partida: la mejora es enorme comparada con los niveles de fines de 2023 y 2024.
> • Pobreza frente al pico: según el INDEC, la pobreza de personas bajó del 52,9% en el primer semestre de 2024 al 28,2% en el segundo semestre de 2025.
>
> Lo que no funciona o se estancó:
>
> • Inflación: en octubre de 2026 fue del 2,2% mensual, por encima del 1,9% de septiembre y de lo que esperaban los analistas. Acumula 33,1% interanual, así que Argentina sigue entre los países con más inflación del mundo y la baja no se consolida.
> • Actividad: la economía está estancada. El estimador mensual del INDEC (EMAE) cayó 1,7% interanual en agosto de 2026, la peor caída del año, después de caer 1,4% en julio. La industria bajó 4,4% interanual y la construcción 3,2%. La capacidad instalada en uso ronda apenas el 58%.
> • Inversión: en el segundo trimestre de 2026 cayó 11,1% interanual, una señal preocupante para el crecimiento futuro.
> • Pobreza: volvió a subir, al 32,3% en el primer semestre de 2026, y la indigencia también aumentó. Mediciones alternativas, como las de la UCA o la Universidad Torcuato Di Tella (UTDT), señalan un deterioro mayor.
>
> Mi evaluación: el plan logró estabilizar una economía que estaba al borde de la hiperinflación y ordenó las cuentas públicas, algo que pocos gobiernos anteriores habían conseguido. Pero la segunda etapa no está funcionando por ahora: baja de la inflación a niveles internacionales, crecimiento con inversión y mejora social sostenida. Hoy se combinan estancamiento, inflación del 2% mensual y aumento de la pobreza.
>
> Los defensores del plan atribuyen parte del freno a factores externos y lo ven como una transición. Los críticos señalan que el modelo favorece a sectores como la energía y la minería, mientras la industria y el comercio sufren. Cuál de las dos lecturas se impone dependerá de si la actividad y los salarios reales se recuperan en los próximos trimestres.

### Answer B

> La evaluación depende del objetivo y del plazo: el plan logró en buena medida estabilizar la economía y ordenar las cuentas públicas, pero todavía no consiguió un crecimiento amplio, empleo en alza ni una mejora social sostenida.
>
> Antes de repasar los datos, conviene separar los resultados observados de su atribución al Gobierno: que un indicador mejore o empeore durante su mandato no demuestra, por sí solo, cuánto se debe al plan. También importa la comparación elegida: recuperarse de la caída de 2024 no equivale necesariamente a superar los niveles anteriores al ajuste.
>
> La inflación bajó de forma marcada: pasó de más de 200 % anual a fines de 2023, con un pico cercano al 290 % en 2024, a cerca del 31,5 % en 2025 y alrededor del 33 % interanual en 2026. Según el INDEC, en agosto de 2026 fue del 1,7 % mensual y del 33,5 % interanual. En octubre de 2026 volvió a subir: 2,2 % mensual y 33,1 % interanual, por encima de septiembre (1,9 %) y de lo esperado. Bajar la inflación significa que los precios suben más lento, no que bajen de nivel.
>
> El sector público nacional pasó del déficit a superávit desde 2024, el primero en más de una década según las fuentes. El superávit primario fue de 0,6 % del PBI en el segundo trimestre de 2026 y el mercado proyecta superávit para todo 2026, aunque el margen se achicó.
>
> La actividad es desigual. El PIB cayó en 2024, creció cerca de 4,5 % en 2025 y en el segundo trimestre de 2026 subió 2 % interanual, pero cayó 0,6 % frente al trimestre anterior desestacionalizado. En ese mismo trimestre retrocedieron el consumo privado y la inversión (FBKF cayó 11,1 % interanual). El EMAE cayó 1,7 % interanual en agosto de 2026 tras caer 1,4 % en julio, y en agosto la industria bajó cerca de 4,4 % interanual y la construcción 3,2 %, con capacidad instalada en torno al 58 %.
>
> El empleo es una señal preocupante: en agosto de 2026 había unos 274.000 asalariados privados registrados menos que en noviembre de 2023, según datos del SIPA. El desempleo llegó al 7,9 % en el segundo trimestre de 2026, y la recuperación se concentra en sectores exportadores mientras la industria, el comercio y la construcción siguen rezagados.
>
> La pobreza de personas en aglomerados urbanos fue de 52,9 % en el primer semestre de 2024, bajó a 28,2 % en el segundo semestre de 2025 y volvió a subir a 32,3 % en el primer semestre de 2026, según el INDEC. Mediciones alternativas de la UCA y la UTDT muestran niveles o deterioros mayores.
>
> Las exportaciones de bienes crecieron 23,5 % interanual en septiembre de 2026, impulsadas sobre todo por energía y minería.
>
> Para considerarlo un éxito duradero, el plan debería sostener la baja de la inflación y el equilibrio fiscal mientras mejora de forma persistente el empleo, el poder adquisitivo y la pobreza. También habría que evaluar la sostenibilidad externa: la disponibilidad de reservas, la capacidad de pagar o refinanciar la deuda y la posibilidad de mantener la estabilidad cambiaria sin provocar otra crisis.

---

## Pair 32

**Question:** I drive 60 km at 30 km/h and then another 60 km at 90 km/h. What was my average speed for the whole trip?

<details><summary>Reference answer</summary>

45 km/h: 120 km in 2 h + 0.667 h = 2.667 h. Answering 60 km/h (the arithmetic mean of the speeds) is wrong.

</details>

### Answer A

> Your average speed for the whole trip was 45 km/h.
>
> Average speed is total distance divided by total time.
>
> The total distance of the trip is 120 km, made up of two 60 km legs.
>
> The first 60 km at 30 km/h takes 2 hours. The second 60 km at 90 km/h takes 2/3 of an hour (40 minutes). The total time is therefore 8/3 hours (2 hours 40 minutes).
>
> Dividing total distance by total time gives 120 km ÷ 8/3 h = 45 km/h.
>
> The simple average of 30 and 90 km/h, which is 60 km/h, is not the correct answer. For two legs of equal distance, the average speed is the harmonic mean of the two speeds, not the arithmetic mean.

### Answer B

> Your average speed was 45 km/h, not 60 km/h.
>
> Average speed means total distance divided by total time. The first 60 km at 30 km/h takes 2 hours. The second 60 km at 90 km/h takes 40 minutes (2/3 of an hour). So you covered 120 km in 2 h 40 min, which is 8/3 hours, and 120 ÷ (8/3) = 45 km/h.
>
> Simply averaging 30 and 90 to get 60 doesn't work. That's because you spent much more time driving at the slower speed. When two legs cover equal distances, the average speed is the harmonic mean of the two speeds: 2·30·90/(30+90) = 45 km/h.

---

## Pair 33

**Question:** Pongo $1.000.000 en un plazo fijo a 30 días con una TNA del 36%. ¿Cuánto cobro de intereses? ¿Y qué tasa efectiva anual me queda si lo renuevo todo el año con los intereses incluidos, a la misma tasa?

<details><summary>Reference answer</summary>

Intereses: 1.000.000 × 0,36 × 30/365 ≈ $29.589 (se acepta $29.500–$29.600; $30.000 con año de 360 días se acepta solo si lo aclara). TEA = (1 + 0,36×30/365)^(365/30) − 1 ≈ 42,6% (se acepta 42%–43%; con exactamente 12 renovaciones da ≈ 41,9%, también aceptable). Decir que la TEA es 36% es incorrecto.

</details>

### Answer A

> Cobrarías unos $29.589 de intereses en 30 días. Si renovás todo el año con los intereses incluidos, la tasa efectiva anual queda en alrededor de 42,6%.
>
> **Intereses a 30 días.** En Argentina los bancos calculan el plazo fijo tradicional con año de 365 días. La tasa del período es 36% × 30/365 ≈ 2,959%. Entonces el interés es $1.000.000 × 0,36 × 30/365 ≈ $29.589,04. Al vencimiento retirarías unos $1.029.589.
>
> **Tasa efectiva anual (TEA) renovando con intereses.** Al reinvertir capital más intereses a la misma tasa, el interés se capitaliza. La fórmula es TEA = (1 + 0,36 × 30/365)^(365/30) − 1 ≈ 42,6%.
>
> En la práctica no se puede renovar 12,17 veces. Con 12 renovaciones de 30 días (360 días) terminarías con ≈ $1.418.950, es decir ≈ 41,9% en ese período. Con los días que faltan para completar el año llegarías a cerca de $1.426.000.
>
> **Si el banco usara año de 360 días.** El interés sería exactamente $30.000 y la TEA ≈ 43,3%. Lo habitual en Argentina es base 365; la TEA que informa el banco te sirve para confirmar cuál usa.
>
> **Advertencias.** Todo esto supone que la TNA se mantiene en 36% en cada renovación, cosa que en la práctica suele cambiar. Además, son valores nominales: el rendimiento real depende de la inflación del período.

### Answer B

> Con $1.000.000 a 30 días y una TNA del 36%, en base de 365 días (la habitual en plazos fijos tradicionales en pesos en Argentina), cobrás $29.589,04 de intereses y al vencimiento tenés $1.029.589,04. La tasa del período de 30 días es de aproximadamente 2,959%.
>
> Si renovás todo el año capital más intereses cada 30 días y a la misma TNA, la TEA es de aproximadamente 42,59%. Se calcula como (1 + 0,36 × 30/365)^(365/30) − 1.
>
> Los intereses se reinvierten en cada vencimiento, por eso la TEA supera a la TNA: es interés compuesto, siempre que se mantenga la tasa supuesta. Doce períodos de 30 días suman 360 días, no 365; con 12 renovaciones de 30 días el capital llega a unos $1.418.950, un rendimiento de alrededor de 41,9% en ese período.
>
> Si el banco usara año de 360 días, el interés a 30 días sería de $30.000, es decir un 3% exacto por período. Con 12 renovaciones, (1,03)^12 − 1 ≈ 42,58%. Si se anualiza sobre 365 días, (1,03)^(365/30) − 1 ≈ 43,3%. Estas dos cifras de TEA en esa base no se contradicen, porque solo cambia el exponente.
>
> Todo lo anterior supone que la TNA se mantiene en 36% en cada renovación, algo que en la práctica suele cambiar. Son valores nominales: el rendimiento real depende además de la inflación del período. Conviene confirmar con el banco qué base de días usa; la TEA que informa sirve para verificarlo.

---

## Pair 34

**Question:** Conviene dolarizar la economía argentina?

<details><summary>Grading guide</summary>

Debe presentar los argumentos a favor (fin de la emisión y de la inflación crónica, credibilidad, ejemplos de Ecuador y Panamá) y en contra (pérdida de la política monetaria y del prestamista de última instancia, falta de dólares para hacerlo, tipo de cambio de conversión, rigidez frente a shocks, la experiencia de la convertibilidad y 2001), que hay economistas serios de ambos lados y que depende de cómo se implemente. Es parcial si presenta una postura como consenso o caricaturiza la otra.

</details>

### Answer A

> No hay una respuesta técnica única, porque depende de qué se valore más y del momento en que se haga. Mi conclusión es que hoy no conviene una dolarización formal y completa. Puede tener sentido como opción a futuro, pero solo si antes se cumplen condiciones que Argentina todavía no reúne.
>
> A favor: dolarizar terminaría de raíz con la emisión monetaria para financiar al Tesoro, que es la causa histórica de la alta inflación argentina. Importaría la credibilidad de la Reserva Federal y bajaría la inflación a niveles internacionales. Ecuador (2000) logró así frenar una crisis de inflación muy alta, y Panamá funciona dolarizado desde hace más de un siglo. Además, los argentinos ya ahorran en dólares, así que en parte se reconocería una realidad.
>
> En contra hay cinco problemas:
>
> 1. Hacen falta dólares para comprar la base monetaria y los pasivos remunerados del Banco Central, y las reservas netas son escasas. Una consultora estimaba unos US$14.000 millones de reservas netas a fines de marzo de 2026, frente a los US$35.000–40.000 millones que muchos analistas consideran necesarios. El FMI sigue calificando la cobertura de reservas como "muy inadecuada". Dolarizar con pocas reservas obliga a un tipo de conversión muy depreciado, con un golpe inflacionario y sobre los ingresos, o a endeudarse caro.
>
> 2. Se pierde el tipo de cambio como amortiguador. Argentina exporta materias primas y tiene un ciclo distinto al de EE.UU. y muy ligado a Brasil. Ante una sequía, una caída de precios o una devaluación brasileña, el ajuste recaería sobre salarios, empleo y actividad.
>
> 3. El Banco Central deja de poder actuar como prestamista de última instancia ante una corrida bancaria.
>
> 4. Se pierde el señoreaje, es decir, la ganancia que obtiene el Estado por emitir su propia moneda.
>
> 5. Dolarizar no resuelve el problema fiscal. Si el Estado sigue gastando más de lo que recauda, la crisis se traslada a la deuda. La Convertibilidad terminó en el colapso de 2001, y Ecuador, ya dolarizado, dejó de pagar parte de su deuda en 2008. Si hay disciplina fiscal, una moneda propia también puede ser estable. Si no la hay, la dolarización tampoco salva.
>
> El propio gobierno de Milei, que hizo campaña con la dolarización, no la aplicó. Devaluó en diciembre de 2023 y en abril de 2025 adoptó bandas cambiarias con un programa del FMI de US$20.000 millones. Desde 2026 las bandas se ajustan según la inflación, el Banco Central compra reservas y se busca que la economía vuelva a usar pesos, mientras se permite la competencia de monedas. Ese enfoque gradual, con superávit fiscal, Banco Central sin financiar al Tesoro, acumulación de reservas y libertad de usar dólares, me parece más prudente que una dolarización forzada.
>
> En resumen: la dolarización puede justificarse como último recurso ante una crisis de confianza extrema, o como paso final una vez que haya reservas suficientes y solvencia fiscal. Como medida para aplicar ya, sus costos y riesgos superan hoy a sus beneficios. En esto hay un desacuerdo legítimo entre economistas: algunos sostienen que solo una regla tan rígida puede disciplinar a la política argentina.

### Answer B

> Hoy no conviene dolarizar oficialmente la economía argentina. No hay consenso técnico: existen argumentos sólidos a favor y en contra, pero, con las condiciones actuales —reservas líquidas insuficientes y una solvencia fiscal aún frágil—, la mayoría de los análisis citados concluye que los costos y riesgos de una conversión inmediata superan los beneficios. Una dolarización solo tendría sentido como último recurso o como paso final, una vez que existan reservas suficientes y solvencia fiscal.
>
> Los defensores de la dolarización sostienen que adoptar el dólar permitiría erradicar la inflación, reducir las tasas de interés y dar un compromiso institucional difícil de revertir, dada la histórica falta de credibilidad del peso. Según este argumento, el principal beneficio es la desaparición rápida de la inflación y de la prima de devaluación en las tasas. También se señala que eliminar la emisión del peso impediría financiar el déficit con moneda nacional y que desaparecería el riesgo de devaluación mientras dure el régimen.
>
> Argentina ya presenta un alto grado de dolarización de facto, tanto en el ahorro privado como en mercados como el inmobiliario. Por eso, en parte, la dolarización formal reconocería una realidad ya existente.
>
> La dolarización no elimina por sí sola el déficit fiscal ni el riesgo de default. Un Estado que gasta más de lo que recauda seguiría teniendo que ajustar, endeudarse o incumplir. Tampoco impone límites automáticos al gasto ni al endeudamiento, y no asegura crecimiento económico. Las tasas podrían bajar por la desaparición del riesgo cambiario, pero no pasarían automáticamente a ser las de Estados Unidos. Ecuador, ya dolarizado, dejó de pagar parte de su deuda en 2008. La Convertibilidad argentina, que fue una caja de conversión y no una dolarización plena, colapsó en 2001.
>
> El principal costo es perder el tipo de cambio como instrumento de ajuste. Argentina exporta materias primas y su ciclo económico no coincide con el de Estados Unidos, y está muy ligada a Brasil. Ante una sequía, una caída de precios internacionales o una devaluación de un socio comercial, el ajuste recaería sobre salarios, precios internos, empleo y actividad, mediante recesión o deflación. Además, el país dejaría de contar con el Banco Central como prestamista de última instancia y con los ingresos del señoreaje.
>
> Sin un Banco Central que emita la moneda en la que están denominados los depósitos, el sistema financiero queda más expuesto a corridas bancarias, salvo que se constituyan fondos de liquidez o esquemas de banca restringida. Una economía dolarizada necesita reservas o líneas de crédito contingentes externas para proveer liquidez, porque no puede emitir dólares.
>
> La escasez de reservas netas líquidas es el obstáculo central. Según las mediciones citadas, las reservas no alcanzan para retirar la base monetaria y respaldar depósitos sin apoyo externo masivo. Una consultora estimó unos US$14.000 millones de reservas netas a fines de marzo de 2026, frente a los US$35.000-40.000 millones que muchos analistas consideran necesarios. El FMI califica como muy inadecuada la cobertura de reservas. Con pocas divisas, la conversión obligaría a un tipo de cambio muy alto, con una fuerte licuación de salarios y ahorros, a una recesión o a un endeudamiento caro. Evaluar la transición exige conocer las divisas disponibles, las obligaciones a convertir, las reglas de conversión y el respaldo de liquidez bancaria. Convertir un salario a dólares no aumenta por sí mismo su poder adquisitivo.
>
> Milei hizo campaña a favor de la dolarización, pero no la aplicó. En diciembre de 2023 el tipo de cambio oficial pasó de unos $366 a $800 por dólar —un salto de alrededor del 120%, equivalente a que el peso perdiera cerca de la mitad de su valor en dólares— y, desde el 11 de abril de 2025, adoptó un régimen de bandas cambiarias que empezó con un rango de $1.000 a $1.400 por dólar. Desde enero de 2026 las bandas se ajustan según la inflación del INDEC, y el BCRA tiene un programa de compra de reservas para que la economía vuelva a usar pesos. La inflación bajó de más de 200% interanual a fines de 2023 a alrededor de 30% en 2025-2026, lo que reduce el beneficio de corto plazo de dolarizar. La dolarización total no se implementó: el régimen vigente es de competencia de monedas y banda cambiaria, y la dolarización endógena se frenó en 2025.
>
> Si la estabilización logra inflación baja y sostenida, las experiencias de Perú y Uruguay sugieren que puede disminuir gradualmente la dolarización financiera. Esa posibilidad ofrece una alternativa a la dolarización plena, pero no garantiza que Argentina siga el mismo camino ni permite decidir por sí sola qué régimen monetario le conviene.

---

## Pair 35

**Question:** Cómo le paso corriente a un auto que se quedó sin batería?

<details><summary>Grading guide</summary>

Pasos esenciales: con los dos autos apagados, conectar el cable rojo al positivo (+) de la batería descargada y luego al positivo de la buena, el negro al negativo (−) de la buena y el otro extremo a una parte metálica sin pintar del motor del auto descargado (no al negativo de la batería descargada), arrancar el auto que anda, esperar unos minutos, arrancar el otro y desconectar en orden inverso. Cautelas: no juntar las pinzas, no hacerlo con una batería rota, hinchada o congelada, cuidado con el ventilador y las correas, y dejar andar el auto un rato para que cargue.

</details>

### Answer A

> Para pasarle corriente ("puentear") a un auto con la batería descargada necesitas un juego de cables de arranque (pinzas) y otro auto con batería en buen estado del mismo voltaje, casi siempre 12 V. También sirve un arrancador portátil ("booster").
>
> Preparación: acerca los autos sin que se toquen. Apaga los dos motores, quita las llaves y apaga luces, radio y aire acondicionado. Pon el freno de mano y deja la palanca en punto muerto (o en P si es automático). Revisa la batería descargada: si está hinchada, rota, con fugas o congelada, no la puentees. Antes de empezar, mira el manual del auto, porque algunos modelos traen bornes especiales para esto, a veces lejos de la batería.
>
> Orden para conectar los cables:
> 1) Pinza roja al borne positivo (+) de la batería descargada.
> 2) La otra pinza roja al borne positivo (+) de la batería buena.
> 3) Pinza negra al borne negativo (−) de la batería buena.
> 4) La última pinza negra a una parte metálica sin pintar del motor o del chasis del auto descargado, lejos de la batería. Esto es la "tierra". Así, si salta una chispa, queda lejos de los gases que puede soltar la batería. Cuida que las pinzas no se toquen entre sí y que los cables no queden cerca del ventilador ni de las correas.
>
> Arranque: enciende el auto que está bien y déjalo andando unos minutos, unos 2 a 5. Luego intenta arrancar el auto descargado. Si no arranca, espera unos minutos más y vuelve a probar. No le des arranque más de unos segundos seguidos.
>
> Desconexión, en el orden inverso: primero la pinza negra de la tierra del auto que revivió, después la negra de la batería buena, luego la roja de la batería buena y al final la roja del auto que revivió.
>
> Después: deja el auto andando o sal a manejar unos 20 a 30 minutos para que el alternador cargue la batería. Si vuelve a quedarse sin batería pronto, puede que la batería esté gastada (suelen durar unos 3 a 5 años) o que falle el alternador. Llévalo a revisar.
>
> Si el auto es de caja manual y no tienes cables, otra opción es arrancarlo empujando. Esto no sirve en autos automáticos.

### Answer B

> Para pasar corriente a un auto con batería descargada necesitas cables pasacorriente y otro auto con batería cargada del mismo voltaje, normalmente 12 V, y siempre siguiendo las indicaciones del manual de ambos vehículos. Conecta las pinzas en este orden: primero roja al positivo (+) de la batería descargada; segundo, la otra roja al positivo (+) de la batería cargada; tercero, negra al negativo (−) de la batería cargada; y por último, la otra negra a una pieza metálica sin pintura del auto descargado.
>
> Antes de conectar, aparca los autos sin que se toquen, apaga ambos motores, quita las llaves y apaga luces, radio y aire acondicionado. Pon el freno de estacionamiento y deja la transmisión en P si es automática o en neutro si es manual.
>
> No intentes pasar corriente si la batería está hinchada, rota, agrietada, con fugas o congelada, porque puede explotar. Tampoco uses como donante un híbrido o eléctrico sin confirmar que el fabricante lo permite. En esos casos sigue el manual del fabricante.
>
> La última pinza negra debe ir a un punto de masa metálico, lejos de la batería y del combustible, porque una chispa allí no enciende los gases que puede soltar la batería. No la conectes directamente al negativo de la batería descargada. Cuida además de que las pinzas no se toquen entre sí ni con metal suelto, y de que no hagas la conexión al revés, porque puede dañar el motor de arranque y la electrónica del auto.
>
> Enciende el auto donante y déjalo en ralentí uno o dos minutos, o entre dos y cinco, para que transfiera algo de carga. Luego intenta arrancar el auto descargado. Si no enciende, espera un poco y vuelve a intentarlo, sin insistir demasiado; si sigue sin arrancar, pide asistencia. Mantén los cables lejos de ventiladores y correas.
>
> Cuando el auto arranque, retira las pinzas en orden inverso al de conexión: primero la negra del auto que estaba descargado, luego la negra del donante, después la roja del donante y por último la roja del auto descargado. Mantén las manos y los cables lejos de piezas móviles.
>
> Después del arranque, conduce o deja el motor encendido unos 20 a 30 minutos para que el alternador recargue la batería. Ten en cuenta que esto no garantiza una carga completa ni recupera una batería dañada. Las baterías suelen durar unos 3 a 5 años; si el auto vuelve a quedarse sin batería pronto, puede que la batería esté gastada o que falle el sistema de carga, así que llévalo a revisar.

---

## Pair 36

**Question:** Quiero dar de baja un servicio y no me dejan, me hacen llamar mil veces. Qué hago?

<details><summary>Grading guide</summary>

Pasos esenciales: usar el 'botón de baja' que las empresas deben tener en su web (obligatorio en Argentina), pedir el número de trámite de la baja, dejar constancia por escrito (mail o carta documento) y, si no la dan, reclamar en Defensa del Consumidor por la Ventanilla Única Federal o el organismo local, o en el ente regulador (ENACOM, o el BCRA para bancos y tarjetas). Cautelas: guardar comprobantes, controlar que no sigan cobrando y desconocer los débitos automáticos con el banco si lo hacen.

</details>

### Answer A

> Lo que te está pasando es muy común: las empresas te hacen llamar una y otra vez para intentar retenerte. En muchos países es ilegal ponerte trabas para dar de baja un servicio. No me dices dónde vives, así que te doy unos pasos que sirven en general y luego lo que dice la ley en algunos países.
>
> 1) Pide la baja por escrito, con prueba de que la enviaste. No dependas solo del teléfono. Manda un email, usa el formulario o el botón de baja de la web, o envía un burofax o una carta documento. Escribe algo claro como: "Solicito la baja del servicio X, a nombre de [tu nombre], con número de cliente o DNI [número], con efecto inmediato. Pido confirmación y número de gestión". Guarda capturas, la fecha y la hora.
>
> 2) Si llamas, pide siempre un número de reclamo o de baja y apunta la fecha, la hora y el nombre de quien te atendió. Di que no aceptas ofertas para quedarte: "no quiero ofertas, quiero la baja".
>
> 3) Revisa la web y la app de la empresa. Muchas están obligadas a tener una opción de baja visible.
>
> 4) Si te siguen cobrando, avisa a tu banco o a la tarjeta. Puedes pedir que dejen de pagar los cargos o desconocerlos, y adjuntar la prueba de que pediste la baja. Reclama también que te devuelvan lo que te cobraron después de esa fecha.
>
> 5) Si la empresa no responde, presenta una queja ante el organismo de consumo de tu país, con todas las pruebas. Este trámite suele ser gratis.
>
> Lo que dice la ley en algunos países:
>
> - España: la ley de consumidores (artículo 62 del TRLGDCU) dice que puedes terminar el contrato de la misma forma en que lo firmaste. Si lo contrataste por internet, puedes darte de baja por internet. Además, no te pueden poner trabas, penalizaciones desproporcionadas ni cobrarte por servicios que no recibiste. Si tienes un compromiso de permanencia, la penalización tiene que ser proporcional a los días que falten. Puedes reclamar en la Oficina Municipal de Información al Consumidor (OMIC) o en el organismo de consumo de tu comunidad autónoma. Si es una empresa de telecomunicaciones, también ante la Oficina de Atención al Usuario de Telecomunicaciones.
>
> - Argentina: la Ley 24.240 (artículo 10 ter) te permite dar de baja el servicio por el mismo medio por el que lo contrataste. No te pueden cobrar preaviso ni un mes por adelantado (artículo 10 quáter). La Disposición 954/2025 obliga a las empresas que venden a distancia a tener un "Botón de baja de servicio" visible en su web, sin pedirte registro ni otros trámites. En 24 horas te tienen que dar un código de la solicitud. Puedes denunciar ante Defensa del Consumidor (nacional o de tu provincia o ciudad), por ejemplo a través de la Ventanilla Federal o del COPREC.
>
> - México y otros países: acude a la Profeco o al organismo de consumo de tu país, que suele recibir este tipo de quejas.
>
> Si me dices en qué país estás y qué servicio es (telefonía, gimnasio, streaming, seguro…), te ayudo a redactar el mensaje de baja o el reclamo.

### Answer B

> Pide la baja por escrito y guarda prueba de envío, porque un canal que deje comprobante permite acreditar tu solicitud. Conserva capturas, correos, facturas y números de trámite. Si llamas, exige el número de gestión, anota la fecha, la hora y el nombre del operador, y guarda las grabaciones o capturas de la gestión. Si la empresa te da un folio o código de cancelación, debe entregártelo.
>
> Bloquear el cobro no equivale a cancelar el contrato: quitar el débito automático o dejar de pagar puede dejar el servicio activo y dar lugar a que la empresa reclame una deuda. Por eso conviene solicitar formalmente la baja y guardar el comprobante. Si te siguen cobrando, comprueba qué período y concepto facturan: no todo cargo recibido después de solicitar la baja es necesariamente indebido. Reclama los importes que no correspondan y consulta con tu banco o tarjeta cómo impugnarlos y qué plazos tienes; devolver un recibo no resuelve por sí solo la disputa con la empresa.
>
> En Argentina, la Disposición 954/2025 obliga a los proveedores que venden a distancia a tener un «Botón de baja de servicio» visible en su web, sin registración previa ni trámites adicionales, y a informar el código de la baja en 24 horas. La Ley 24.240 permite rescindir el servicio por el mismo medio utilizado para contratarlo (art. 10 ter) y prohíbe cobrar un mes por adelantado, preaviso u otro concepto por dar de baja (art. 10 quáter).
>
> En España, el artículo 62 del TRLGDCU permite poner fin a un contrato de servicios continuados en la misma forma en que se celebró, sin sanciones ni cargas desproporcionadas. En telecomunicaciones, puedes darte de baja aunque tengas una deuda pendiente: la deuda no impide la baja, pero la empresa puede reclamarla después. Debes comunicarla con al menos dos días hábiles de antelación a la fecha en que quieras que sea efectiva; el operador no puede cobrar servicios posteriores al plazo en que debió tramitarla por causas no imputables a ti. Debe admitir la baja por el mismo medio utilizado para contratar. Si la tramitas por teléfono, pide el número de referencia y un documento que acredite la solicitud. Si tienes permanencia, revisa los importes que puedan corresponder por finalizar anticipadamente: la penalización debe ser proporcional a los días pendientes.
>
> En España, otros servicios, como seguros, suministros o alarmas, pueden tener reglas distintas sobre vencimiento, preaviso y costes de terminación. No des por hecho que todos se pueden cancelar inmediatamente y sin coste: revisa el contrato y la normativa del sector, y deja constancia escrita de la solicitud.
>
> Al terminar el servicio, revisa si el contrato te obliga a devolver equipos cedidos o alquilados, y guarda el justificante de devolución.
>
> Los plazos y los organismos competentes dependen del país y del tipo de servicio. Con las pruebas de tu solicitud, presenta una reclamación formal a la empresa y, si no responde o no resuelve, acude al organismo de consumo: en Argentina, la Ventanilla Federal Única de Defensa del Consumidor o Defensa del Consumidor de tu provincia; en México, la Profeco; en España, la OMIC o el organismo de consumo de tu comunidad. En telecomunicaciones españolas, si la baja no se tramita conforme a la norma, puedes reclamar ante la Oficina de Atención al Usuario de Telecomunicaciones.
>
> ¿En qué país estás y qué servicio y empresa quieres dar de baja? ¿Tienes algún comprobante de haber solicitado ya la baja? Con esos datos puedo indicarte el canal de reclamación y los plazos aplicables.

---

## Pair 37

**Question:** Se me tapó la pileta de la cocina, cómo la destapo sin llamar al plomero?

<details><summary>Grading guide</summary>

Pasos esenciales: sacar el agua estancada, probar con agua caliente (no hirviendo si el caño es de PVC), usar una sopapa tapando el rebalse, desarmar y limpiar el sifón con un balde abajo, probar bicarbonato con vinagre o una sonda o alambre. Cautelas: no mezclar productos químicos (ni con lavandina), usar guantes y anteojos con la soda cáustica, no desarmar el sifón después de echar químicos, y llamar al plomero si sigue tapada o el problema está en la cañería principal.

</details>

### Answer A

> Antes de empezar: si ya echaste soda cáustica o un destapacañerías químico, no agregues otros productos, no uses la sopapa ni desarmes el sifón; puede quedar líquido corrosivo y salpicar. Seguí las indicaciones de seguridad de la etiqueta. Si no usaste químicos, sacá el agua estancada con un recipiente y retirá los restos visibles, con guantes. En la cocina, el tapón suele formarse por grasa y restos de comida.
>
> Probá agua caliente con detergente: echá un buen chorro de detergente para platos y después agua caliente de a poco. Si los caños son de PVC o la bacha es de loza, no uses agua hirviendo, porque puede ablandar o deformar las uniones o rajar la loza.
>
> Usá una sopapa: dejá unos centímetros de agua para que selle y tapá el otro desagüe de la bacha doble, y el rebalse si lo tiene, con un trapo húmedo. Bombeá firme unas 10 a 20 veces y después levantá de golpe. Repetí varias veces.
>
> Probá bicarbonato y vinagre: volcá media taza de bicarbonato, después una taza de vinagre blanco, tapá el desagüe 15 a 30 minutos y enjuagá con agua caliente. Sirve para tapones leves; los más firmes no suelen salir así.
>
> Si sigue tapada, limpiá el sifón, la curva que está debajo de la bacha. Poné un balde y trapos debajo, sacá una foto antes de tocarlo y aflojá las tuercas a mano; si están duras, usá una pinza protegida con un trapo. Sacá la grasa y los restos, enjuagá las piezas, revisá que las juntas queden en su lugar y volvé a armar sin apretar de más. Después abrí la canilla para comprobar que drene y no gotee.
>
> Si el sifón está limpio y la pileta sigue tapada, la obstrucción puede estar más adelante en el desagüe. Si te animás, con el sifón retirado podés introducir una sonda manual para desagües adecuada al caño, siguiendo sus instrucciones y avanzando suavemente. No uses alambres ni cables improvisados ni fuerces la herramienta: si se traba o encontrás mucha resistencia, detenete. Al terminar, volvé a montar el sifón y comprobá el drenaje y que no haya pérdidas.
>
> Si usaste soda cáustica o un destapacañerías químico, no agregues nada más ni uses la sopapa ni desarmes el sifón, porque puede salpicar líquido corrosivo. Si usás un químico, usá guantes y antiparras y seguí la etiqueta. No mezcles productos entre sí ni con vinagre o lavandina. Evitá la soda cáustica y los ácidos concentrados, que pueden quemar la piel y dañar los caños.
>
> Llamá a un plomero si estos pasos no funcionan, si hay pérdidas o si no podés desmontar y volver a armar el sifón con seguridad. También conviene pedir ayuda si varios desagües fallan a la vez, el agua vuelve por otro lado o hay olor persistente a cloaca: esos signos pueden indicar un problema más amplio. Que solo la pileta siga tapada con el sifón limpio no significa necesariamente que esté obstruida la cañería principal. Avisale qué productos usaste.
>
> Para que no se repita: no tires aceite ni grasa por la pileta (juntalo en una botella), usá una rejilla para los restos de comida y una vez por semana pasá agua caliente con detergente.

### Answer B

> Probá de lo más suave a lo más invasivo:
>
> 1) Agua caliente y detergente. Sacá el agua estancada con un vaso o jarro. Echá un buen chorro de detergente y después agua bien caliente, de a poco. Ojo: si los caños son de PVC o la bacha es de loza, no uses agua hirviendo, porque puede deformar las uniones o rajar la loza. Sirve sobre todo cuando el tapón es grasa, que es lo más común en la cocina.
>
> 2) Sopapa. Dejá unos centímetros de agua en la pileta para que haga sello. Si es una bacha doble, tapá el otro desagüe con un trapo húmedo. Si tiene rebalse, tapalo también. Bombeá firme unas 15 a 20 veces y después levantá de golpe. Repetilo varias veces.
>
> 3) Bicarbonato y vinagre. Echá media taza de bicarbonato, después una taza de vinagre, tapá el desagüe y esperá 15 a 30 minutos. Después enjuagá con agua caliente. Sirve para tapones leves. Los más firmes no siempre salen así, pero no cuesta nada probar.
>
> 4) Limpiar el sifón. Suele ser lo que más funciona. Es la curva de caño que está abajo de la bacha. Poné un balde debajo y tené guantes y trapos a mano. Desenroscá las tuercas a mano (si están duras, usá una pinza con un trapo para no romperlas), o la tapa inferior si el sifón la tiene. Sacá la grasa y los restos de comida y lavalo. Volvé a armarlo revisando que los burletes queden bien puestos. Abrí la canilla para ver que no gotee.
>
> 5) Sonda o cinta destapa cañerías. Si el sifón está limpio y sigue tapado, el problema está más adentro, en el caño que va a la pared. Metés por ahí una cinta o sonda (se consigue barata en ferreterías), girándola y empujando hasta romper el tapón. Después enjuagá con mucha agua caliente.
>
> Qué conviene evitar:
> - No mezcles productos químicos entre sí, ni con vinagre o lavandina, porque pueden largar gases tóxicos o reaccionar con violencia.
> - Si usás soda cáustica o un destapador químico, usá guantes y antiparras, seguí la etiqueta y no uses la sopapa después, porque te puede salpicar.
> - Si ya echaste químicos y no funcionaron, avisale a quien desarme el sifón.
>
> Cuándo llamar al plomero: si nada de esto funciona, si se tapan varios desagües a la vez (por ejemplo la pileta y la ducha), si el agua vuelve por otro lado o si hay olor a cloaca. En esos casos probablemente el problema está en la cañería principal o en la cámara de inspección.
>
> Para que no se repita: no tires aceite ni grasa por la pileta (juntalo en una botella), usá una rejilla para los restos de comida y una vez por semana pasá agua caliente con detergente.

---

## Pair 38

**Question:** Cuál es la capital de Australia?

<details><summary>Reference answer</summary>

Canberra. Sídney o Melbourne son incorrectas.

</details>

### Answer A

> La capital de Australia es Canberra.
>
> Canberra se encuentra en el Territorio de la Capital Australiana (ACT), en el sureste del país.
>
> Canberra fue fundada en 1913 como una ciudad planificada tras un compromiso entre Sídney y Melbourne, y se eligió como solución intermedia por la rivalidad entre ambas ciudades.
>
> El Parlamento federal australiano se reúne en Canberra desde 1927.
>
> Sídney es la ciudad más grande de Australia, pero no es su capital.

### Answer B

> La capital de Australia es Canberra. Está en el Territorio de la Capital Australiana (ACT). Se eligió como solución intermedia por la rivalidad entre Sídney y Melbourne, y es la sede del Parlamento federal desde 1927. Muchas personas creen que la capital es Sídney, pero no es así: Sídney es solo la ciudad más grande del país.

---

## Pair 39

**Question:** Quién ganó el balotaje en Brasil en octubre de 2026 y con cuánto?

<details><summary>Reference answer</summary>

Lula da Silva (PT) fue reelecto para un cuarto mandato en el segundo turno del 25 de octubre de 2026, con alrededor del 51,8% de los votos válidos, frente a Flávio Bolsonaro (PL). Se acepta un porcentaje entre 51,5% y 52%; el ganador y el rival son lo esencial.

</details>

### Answer A

> Luiz Inácio Lula da Silva (PT) ganó el balotaje presidencial de Brasil del 25 de octubre de 2026, con 64.256.232 votos (51,79 % de los votos válidos), frente a los 59.826.041 votos (48,21 %) de Flávio Bolsonaro (PL). La diferencia fue de 4.430.191 votos, equivalentes a aproximadamente 3,57 puntos porcentuales calculados sobre los votos válidos. Lula obtuvo así su cuarto mandato presidencial.
>
> En la primera vuelta, celebrada el 4 de octubre, Flávio Bolsonaro obtuvo el 47,03 % de los votos válidos y Lula el 45,16 %. Lula revirtió esa ventaja en el balotaje. Es la primera vez desde la redemocratización que gana el balotaje quien había quedado segundo en la primera vuelta.
>
> Flávio Bolsonaro anunció que no reconocía el resultado y que su campaña pediría al TSE anular el segundo turno.

### Answer B

> El balotaje (segundo turno) del 25 de octubre de 2026 lo ganó Luiz Inácio Lula da Silva (PT). Con el 100% de las urnas escrutadas, el Tribunal Superior Electoral (TSE) le dio 64.256.232 votos, el 51,79% de los votos válidos. Su rival, el senador Flávio Bolsonaro (PL), obtuvo 59.826.041 votos, el 48,21%. La diferencia fue de unos 4,4 millones de votos, alrededor de 3,6 puntos porcentuales.
>
> Con esta victoria Lula consigue su cuarto mandato, que no es consecutivo, y volverá a tener a Geraldo Alckmin como vicepresidente. Es la primera vez desde la redemocratización que gana el balotaje quien había quedado segundo en la primera vuelta. El 4 de octubre Flávio Bolsonaro había sacado el 47,03% y Lula el 45,16%.
>
> En el segundo turno votó el 80,78% del electorado, con una abstención del 19,22%. Esa misma noche Flávio Bolsonaro dijo que no reconocía el resultado y que su campaña pediría al TSE anular el segundo turno. Su argumento principal fue que una decisión del ministro Cristiano Zanin, del Supremo Tribunal Federal, prolongó la votación hasta las 19 h en las secciones que seguían abiertas.

---

## Pair 40

**Question:** Nos vamos 4 a Mar del Plata en auto desde Buenos Aires, son unos 400 km de ida. El auto gasta 8 litros cada 100 km y la nafta está $1.500 el litro. Contando ida y vuelta y solo la nafta, ¿cuánto pone cada uno?

<details><summary>Reference answer</summary>

$24.000 cada uno: 800 km × 8 L/100 km = 64 L; 64 × $1.500 = $96.000; dividido 4 = $24.000. Calcular solo la ida ($12.000) es incorrecto.

</details>

### Answer A

> Cada uno pone $24.000, porque el total de nafta de ida y vuelta es $96.000 y se reparte entre 4 personas ($96.000 ÷ 4).
>
> El recorrido de ida y vuelta suma 800 km (400 km de ida por 2). Con un consumo de 8 litros cada 100 km, ese recorrido requiere 64 litros de nafta.
>
> A $1.500 el litro, los 64 litros de nafta cuestan $96.000 en total.
>
> Dividido entre las 4 personas, cada una aporta $24.000 solo por la nafta.

### Answer B

> Cada uno pone $12.000.
>
> La cuenta: ida y vuelta son 800 km (400 × 2). A 8 litros cada 100 km, el auto gasta 64 litros (800 ÷ 100 × 8). A $1.500 el litro, la nafta total cuesta $96.000 (64 × 1.500). Dividido entre 4, da $12.000 por persona.
>
> Este número sale de los datos que pasaste: 400 km de ida, 8 L/100 km y $1.500 el litro. No incluye peajes ni estacionamiento. En ruta, con el auto cargado, el consumo puede subir un poco, así que conviene llevar un margen chico.
