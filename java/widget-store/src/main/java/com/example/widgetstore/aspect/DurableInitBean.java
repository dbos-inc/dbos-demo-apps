package com.example.widgetstore.aspect;

import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.ApplicationContext;
import org.springframework.util.ReflectionUtils;

public class DurableInitBean implements InitializingBean {

    private final ApplicationContext context;

    public DurableInitBean(ApplicationContext context) {
        this.context = context;
    }
    
    @Override
    public void afterPropertiesSet() throws Exception {
        for (var name : context.getBeanDefinitionNames()) {
            var bean = context.getBean(name);
            var beanClass = AopUtils.getTargetClass(bean);

            ReflectionUtils.doWithMethods(beanClass, m -> {
                if (m.isAnnotationPresent(Durable.class)) {
                    
                }

            });
        }
    }


}
